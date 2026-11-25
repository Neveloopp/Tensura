import fs from 'fs'
import http from 'http'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import type { SubBotManager } from '../subbots/manager.ts'

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web')
const SESSION_COOKIE = 'tensura_subbots'
const SESSION_HOURS = 12
const MAX_LOGIN_ATTEMPTS = 8
const LOGIN_WINDOW = 10 * 60_000

type WebOptions = {
  manager: SubBotManager
  host: string
  port: number
  phone: string
  password: string
}

type Session = {
  token: string
  csrf: string
  phone: string
  expiresAt: number
  ip: string
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
}

function hash(value: string): Buffer {
  return crypto.createHash('sha256').update(String(value)).digest()
}

function safeEqual(a: string, b: string): boolean {
  const left = hash(a)
  const right = hash(b)
  return crypto.timingSafeEqual(left, right)
}

function randomToken(): string {
  return crypto.randomBytes(32).toString('base64url')
}

function normalizePhone(value: any): string {
  const phone = String(value || '').replace(/\D/g, '')
  if (!/^\d{7,15}$/.test(phone)) throw new Error('Teléfono no válido.')
  return phone
}

function cookies(req: http.IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of String(req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=')
    if (index < 1) continue
    const key = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    if (!key) continue
    try {
      out[key] = decodeURIComponent(value)
    } catch {}
  }
  return out
}

function clientIp(req: http.IncomingMessage): string {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '')
    .split(',')[0]
    .trim()
    .slice(0, 120)
}

function isSecure(req: http.IncomingMessage): boolean {
  const forwarded = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
  return forwarded === 'https' || Boolean((req.socket as any)?.encrypted)
}

function sessionCookie(req: http.IncomingMessage, token: string, expiresAt: number): string {
  const secure = isSecure(req) ? '; Secure' : ''
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Expires=${new Date(
    expiresAt
  ).toUTCString()}; HttpOnly; SameSite=Strict${secure}`
}

function clearSessionCookie(req: http.IncomingMessage): string {
  const secure = isSecure(req) ? '; Secure' : ''
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${secure}`
}

function json(res: http.ServerResponse, status: number, value: any, headers: Record<string, string> = {}) {
  const body = Buffer.from(JSON.stringify(value))
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    ...headers,
  })
  res.end(body)
}

function text(res: http.ServerResponse, status: number, value: string) {
  const body = Buffer.from(String(value))
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(body)
}

async function readJson(req: http.IncomingMessage, limit = 64 * 1024): Promise<any> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new Error('La solicitud es demasiado grande.')
    chunks.push(Buffer.from(chunk))
  }
  if (!chunks.length) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new Error('El cuerpo de la solicitud no es JSON válido.')
  }
}

async function serveFile(res: http.ServerResponse, file: string, cache = false) {
  const resolved = path.resolve(file)
  if (!resolved.startsWith(`${WEB_ROOT}${path.sep}`) && resolved !== path.join(WEB_ROOT, 'index.html')) {
    return text(res, 404, 'Not found')
  }
  try {
    const body = await fs.promises.readFile(resolved)
    const headers: Record<string, string | number> = {
      'content-type': CONTENT_TYPES[path.extname(resolved)] || 'application/octet-stream',
      'content-length': body.length,
      'cache-control': cache ? 'public, max-age=300' : 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'x-frame-options': 'DENY',
    }
    if (path.extname(resolved) === '.html') {
      headers['content-security-policy'] =
        "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
    }
    res.writeHead(200, headers)
    res.end(body)
  } catch {
    text(res, 404, 'Not found')
  }
}

export class SubBotWebServer {
  private options: WebOptions
  private server: http.Server | null = null
  private sessions = new Map<string, Session>()
  private attempts = new Map<string, { count: number; reset: number }>()
  private cleanupTimer: NodeJS.Timeout | null = null

  constructor(options: WebOptions) {
    const phone = normalizePhone(options.phone)
    const password = String(options.password || '')
    if (password.length < 4) {
      throw new Error('SUBBOT_WEB_PASSWORD debe tener al menos 4 caracteres.')
    }
    const requestedPort = Number(options.port)
    this.options = {
      ...options,
      phone,
      password,
      port:
        Number.isInteger(requestedPort) && requestedPort >= 0 && requestedPort <= 65535
          ? requestedPort
          : 3000,
    }
  }

  async start(): Promise<{ host: string; port: number }> {
    if (this.server) throw new Error('El panel web ya está iniciado.')
    this.server = http.createServer((req, res) => {
      void this.route(req, res)
    })
    this.server.requestTimeout = 30_000
    this.server.headersTimeout = 15_000
    try {
      await new Promise<void>((resolve, reject) => {
        const server = this.server!
        server.once('error', reject)
        server.listen(this.options.port, this.options.host, () => {
          server.off('error', reject)
          resolve()
        })
      })
    } catch (error) {
      this.server = null
      throw error
    }
    this.cleanupTimer = setInterval(() => this.cleanup(), 5 * 60_000)
    this.cleanupTimer.unref?.()
    const address = this.server.address()
    const port = typeof address === 'object' && address ? address.port : this.options.port
    console.log(
      `[web] Panel de sub bots disponible en http://${this.options.host}:${port}`
    )
    return { host: this.options.host, port }
  }

  async stop(): Promise<void> {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer)
    this.cleanupTimer = null
    this.sessions.clear()
    const server = this.server
    this.server = null
    if (!server) return
    const closed = new Promise<void>(resolve => server.close(() => resolve())).catch(
      () => undefined
    )
    server.closeAllConnections?.()
    await Promise.race([closed, new Promise(resolve => setTimeout(resolve, 1000))])
  }

  private cleanup() {
    const now = Date.now()
    for (const [token, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(token)
    }
    for (const [ip, entry] of this.attempts) {
      if (entry.reset <= now) this.attempts.delete(ip)
    }
  }

  private session(req: http.IncomingMessage): Session | null {
    const token = cookies(req)[SESSION_COOKIE] || ''
    if (!token) return null
    const session = this.sessions.get(token)
    if (!session) return null
    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(token)
      return null
    }
    return session
  }

  private loginBlocked(ip: string): boolean {
    const entry = this.attempts.get(ip)
    if (!entry) return false
    if (entry.reset <= Date.now()) {
      this.attempts.delete(ip)
      return false
    }
    return entry.count >= MAX_LOGIN_ATTEMPTS
  }

  private recordFailure(ip: string) {
    const now = Date.now()
    const entry = this.attempts.get(ip)
    if (!entry || entry.reset <= now) {
      this.attempts.set(ip, { count: 1, reset: now + LOGIN_WINDOW })
      return
    }
    entry.count += 1
  }

  private requireSession(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    mutation = false
  ): Session | null {
    const session = this.session(req)
    if (!session) {
      json(res, 401, { ok: false, error: 'Inicia sesión para continuar.' })
      return null
    }
    if (mutation) {
      const token = String(req.headers['x-csrf-token'] || '')
      if (!token || !safeEqual(token, session.csrf)) {
        json(res, 403, { ok: false, error: 'Token CSRF inválido.' })
        return null
      }
    }
    return session
  }

  private async route(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url || '/', 'http://localhost')
    let pathname = '/'
    try {
      pathname = decodeURIComponent(url.pathname)
    } catch {
      return text(res, 400, 'Ruta no válida')
    }

    try {
      if (pathname === '/health') {
        return json(res, 200, { ok: true, service: 'Tensura Sub Bots', time: new Date().toISOString() })
      }
      if (pathname.startsWith('/api/')) return await this.api(req, res, pathname)
      if (req.method !== 'GET' && req.method !== 'HEAD') return text(res, 405, 'Método no permitido')

      if (pathname === '/' || pathname === '/panel' || pathname === '/panel/') {
        return await serveFile(res, path.join(WEB_ROOT, 'index.html'))
      }
      if (pathname === '/app.js') return await serveFile(res, path.join(WEB_ROOT, 'app.js'))
      if (pathname === '/style.css') return await serveFile(res, path.join(WEB_ROOT, 'style.css'))
      if (pathname === '/favicon.svg') return await serveFile(res, path.join(WEB_ROOT, 'favicon.svg'))
      return text(res, 404, 'Not found')
    } catch (error: any) {
      if (!res.headersSent) {
        json(res, 500, { ok: false, error: String(error?.message || error || 'Error inesperado.') })
      } else {
        res.destroy()
      }
    }
  }

  private async api(req: http.IncomingMessage, res: http.ServerResponse, pathname: string) {
    const method = String(req.method || 'GET').toUpperCase()

    if (pathname === '/api/session' && method === 'GET') {
      const session = this.session(req)
      if (!session) return json(res, 200, { ok: true, authenticated: false })
      return json(res, 200, {
        ok: true,
        authenticated: true,
        phone: session.phone,
        csrf: session.csrf,
        expiresAt: session.expiresAt,
      })
    }

    if (pathname === '/api/login' && method === 'POST') {
      const ip = clientIp(req)
      if (this.loginBlocked(ip)) {
        return json(res, 429, { ok: false, error: 'Demasiados intentos. Espera unos minutos.' })
      }
      const body = await readJson(req, 8 * 1024)
      let phone = ''
      try {
        phone = normalizePhone(body.phone)
      } catch {}
      const password = String(body.password || '')
      if (!safeEqual(phone, this.options.phone) || !safeEqual(password, this.options.password)) {
        this.recordFailure(ip)
        return json(res, 401, { ok: false, error: 'Teléfono o contraseña incorrectos.' })
      }
      this.attempts.delete(ip)
      const token = randomToken()
      const csrf = randomToken()
      const expiresAt = Date.now() + SESSION_HOURS * 60 * 60_000
      this.sessions.set(token, {
        token,
        csrf,
        phone: this.options.phone,
        expiresAt,
        ip,
      })
      return json(
        res,
        200,
        { ok: true, phone: this.options.phone, csrf, expiresAt },
        { 'set-cookie': sessionCookie(req, token, expiresAt) }
      )
    }

    if (pathname === '/api/logout' && method === 'POST') {
      const session = this.session(req)
      if (session) this.sessions.delete(session.token)
      return json(res, 200, { ok: true }, { 'set-cookie': clearSessionCookie(req) })
    }

    const session = this.requireSession(req, res)
    if (!session) return

    if (pathname === '/api/overview' && method === 'GET') {
      return json(res, 200, { ok: true, data: await this.options.manager.snapshot() })
    }

    if (pathname === '/api/pairings' && method === 'POST') {
      if (!this.requireSession(req, res, true)) return
      const body = await readJson(req, 8 * 1024)
      const data = await this.options.manager.createPairing({
        method: body.method === 'code' ? 'code' : 'qr',
        phone: body.phone,
        managerPhone: session.phone,
      })
      return json(res, 201, { ok: true, data })
    }

    const pairingMatch = pathname.match(/^\/api\/pairings\/([a-zA-Z0-9_-]+)$/)
    if (pairingMatch && method === 'GET') {
      const data = await this.options.manager.getPairing(pairingMatch[1])
      if (!data) return json(res, 404, { ok: false, error: 'Vinculación no encontrada.' })
      return json(res, 200, { ok: true, data })
    }
    if (pairingMatch && method === 'DELETE') {
      if (!this.requireSession(req, res, true)) return
      const removed = await this.options.manager.cancelPairing(pairingMatch[1])
      if (!removed) return json(res, 404, { ok: false, error: 'Vinculación no encontrada.' })
      return json(res, 200, { ok: true })
    }

    const botAction = pathname.match(/^\/api\/bots\/(\d+)\/(start|stop)$/)
    if (botAction && method === 'POST') {
      if (!this.requireSession(req, res, true)) return
      const botId = botAction[1]
      if (botAction[2] === 'start') await this.options.manager.startBot(botId)
      else await this.options.manager.stopBot(botId)
      return json(res, 200, { ok: true, data: await this.options.manager.snapshot() })
    }

    const botMatch = pathname.match(/^\/api\/bots\/(\d+)$/)
    if (botMatch && method === 'DELETE') {
      if (!this.requireSession(req, res, true)) return
      await this.options.manager.removeBot(botMatch[1])
      return json(res, 200, { ok: true, data: await this.options.manager.snapshot() })
    }

    return json(res, 404, { ok: false, error: 'Ruta no encontrada.' })
  }
}

export async function startSubBotWebServer(options: WebOptions) {
  const server = new SubBotWebServer(options)
  const address = await server.start()
  return {
    server,
    ...address,
    stop: () => server.stop(),
  }
}
