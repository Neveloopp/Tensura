import fs from 'fs'
import http from 'http'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import type { SubBotManager } from '../subbots/manager.ts'
import { webAccountStore, type WebAccount, type WebAccountRole } from './accounts.ts'

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web')
const SESSION_COOKIE = 'tensura_subbots'
const SESSION_HOURS = 12
const MAX_LOGIN_ATTEMPTS = 8
const LOGIN_WINDOW = 10 * 60_000
const SESSION_FILE = path.resolve(
  process.env.SUBBOT_WEB_SESSIONS_FILE || path.join('database', 'web-sessions.json')
)

type WebOptions = {
  manager: SubBotManager
  host: string
  port: number
  ownerPhone?: string
  ownerPassword?: string
}

type Session = {
  tokenHash: string
  csrf: string
  accountId: string
  phone: string
  role: WebAccountRole
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

function sessionHash(token: string): string {
  return hash(token).toString('hex')
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
  private persistQueue: Promise<void> = Promise.resolve()

  constructor(options: WebOptions) {
    const requestedPort = Number(options.port)
    this.options = {
      ...options,
      port:
        Number.isInteger(requestedPort) && requestedPort >= 0 && requestedPort <= 65535
          ? requestedPort
          : 3000,
    }
  }

  async start(): Promise<{ host: string; port: number }> {
    if (this.server) throw new Error('El panel web ya está iniciado.')
    await webAccountStore.init()
    await this.loadSessions()
    if (this.options.ownerPhone && this.options.ownerPassword) {
      try {
        const owner = await webAccountStore.ensureOwner(
          this.options.ownerPhone,
          this.options.ownerPassword
        )
        if (typeof (this.options.manager as any).adoptLegacyBots === 'function') {
          const adopted = await (this.options.manager as any).adoptLegacyBots(owner.id, owner.phone)
          if (adopted > 0) console.log(`[web] ${adopted} sub bot(s) asignados a la cuenta administradora.`)
        }
        console.log(`[web] Cuenta administradora lista: +${owner.phone}`)
      } catch (error: any) {
        console.log(`[web] No se pudo crear la cuenta administradora: ${error?.message || error}`)
      }
    }
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
    await this.saveSessions().catch(() => undefined)
    const server = this.server
    this.server = null
    if (!server) return
    const closed = new Promise<void>(resolve => server.close(() => resolve())).catch(
      () => undefined
    )
    server.closeAllConnections?.()
    await Promise.race([closed, new Promise(resolve => setTimeout(resolve, 1000))])
  }

  private async loadSessions(): Promise<void> {
    let parsed: any = null
    try {
      parsed = JSON.parse(await fs.promises.readFile(SESSION_FILE, 'utf8'))
    } catch {
      return
    }
    const now = Date.now()
    for (const raw of Array.isArray(parsed?.sessions) ? parsed.sessions : []) {
      const tokenHash = String(raw?.tokenHash || '')
      const csrf = String(raw?.csrf || '')
      const accountId = String(raw?.accountId || '')
      const phone = String(raw?.phone || '')
      const expiresAt = Number(raw?.expiresAt || 0)
      if (
        !/^[a-f0-9]{64}$/.test(tokenHash) ||
        !csrf ||
        !accountId ||
        !phone ||
        !Number.isFinite(expiresAt) ||
        expiresAt <= now
      ) {
        continue
      }
      this.sessions.set(tokenHash, {
        tokenHash,
        csrf,
        accountId,
        phone,
        role: raw?.role === 'owner' ? 'owner' : 'user',
        expiresAt,
        ip: String(raw?.ip || ''),
      })
    }
    await this.saveSessions().catch(() => undefined)
  }

  private saveSessions(): Promise<void> {
    const operation = this.persistQueue.catch(() => undefined).then(async () => {
      const payload = JSON.stringify({ version: 1, sessions: [...this.sessions.values()] }, null, 2)
      fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true })
      const temporary = `${SESSION_FILE}.${process.pid}.${Date.now()}.tmp`
      await fs.promises.writeFile(temporary, `${payload}\n`, 'utf8')
      await fs.promises.rename(temporary, SESSION_FILE)
    })
    this.persistQueue = operation.catch(error => {
      console.log(`[web] No se pudieron guardar las sesiones: ${error?.message || error}`)
    })
    return operation
  }

  private cleanup() {
    const now = Date.now()
    let changed = false
    for (const [tokenHash, session] of this.sessions) {
      if (session.expiresAt <= now) {
        this.sessions.delete(tokenHash)
        changed = true
      }
    }
    if (changed) void this.saveSessions().catch(() => undefined)
    for (const [ip, entry] of this.attempts) {
      if (entry.reset <= now) this.attempts.delete(ip)
    }
  }

  private session(req: http.IncomingMessage): Session | null {
    const token = cookies(req)[SESSION_COOKIE] || ''
    if (!token) return null
    const tokenHash = sessionHash(token)
    const session = this.sessions.get(tokenHash)
    if (!session) return null
    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(tokenHash)
      void this.saveSessions().catch(() => undefined)
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

  private sessionScope(session: Session): string | undefined {
    return session.role === 'owner' ? undefined : session.accountId
  }

  private async beginSession(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    account: WebAccount,
    status = 200
  ) {
    const token = randomToken()
    const tokenHash = sessionHash(token)
    const csrf = randomToken()
    const expiresAt = Date.now() + SESSION_HOURS * 60 * 60_000
    this.sessions.set(tokenHash, {
      tokenHash,
      csrf,
      accountId: account.id,
      phone: account.phone,
      role: account.role,
      expiresAt,
      ip: clientIp(req),
    })
    await this.saveSessions().catch(() => undefined)
    return json(
      res,
      status,
      { ok: true, accountId: account.id, phone: account.phone, role: account.role, csrf, expiresAt },
      { 'set-cookie': sessionCookie(req, token, expiresAt) }
    )
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
        const requested = Number(error?.statusCode || error?.status || 500)
        const status = requested >= 400 && requested <= 599 ? requested : 500
        json(res, status, {
          ok: false,
          error: String(error?.message || error || 'Error inesperado.'),
        })
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
        accountId: session.accountId,
        phone: session.phone,
        role: session.role,
        csrf: session.csrf,
        expiresAt: session.expiresAt,
      })
    }

    if (pathname === '/api/register' && method === 'POST') {
      const body = await readJson(req, 8 * 1024)
      let account: WebAccount
      try {
        account = await webAccountStore.register({
          phone: body.phone,
          password: body.password,
        })
      } catch (error: any) {
        const requested = Number(error?.statusCode || 400)
        return json(res, requested >= 400 && requested <= 599 ? requested : 400, {
          ok: false,
          error: String(error?.message || error || 'No se pudo crear la cuenta.'),
        })
      }
      return this.beginSession(req, res, account, 201)
    }

    if (pathname === '/api/login' && method === 'POST') {
      const ip = clientIp(req)
      if (this.loginBlocked(ip)) {
        return json(res, 429, { ok: false, error: 'Demasiados intentos. Espera unos minutos.' })
      }
      const body = await readJson(req, 8 * 1024)
      const account = await webAccountStore.verify(body.phone, body.password)
      if (!account) {
        this.recordFailure(ip)
        return json(res, 401, { ok: false, error: 'Teléfono o contraseña incorrectos.' })
      }
      this.attempts.delete(ip)
      return this.beginSession(req, res, account)
    }

    if (pathname === '/api/logout' && method === 'POST') {
      const session = this.session(req)
      if (session) {
        this.sessions.delete(session.tokenHash)
        await this.saveSessions().catch(() => undefined)
      }
      return json(res, 200, { ok: true }, { 'set-cookie': clearSessionCookie(req) })
    }

    const session = this.requireSession(req, res)
    if (!session) return
    const scope = this.sessionScope(session)

    if (pathname === '/api/overview' && method === 'GET') {
      return json(res, 200, { ok: true, data: await this.options.manager.snapshot(scope) })
    }

    if (pathname === '/api/pairings' && method === 'POST') {
      if (!this.requireSession(req, res, true)) return
      const body = await readJson(req, 8 * 1024)
      const data = await this.options.manager.createPairing({
        method: body.method === 'code' ? 'code' : 'qr',
        phone: body.phone,
        managerPhone: session.phone,
        ownerAccountId: session.accountId,
      })
      return json(res, 201, { ok: true, data })
    }

    const pairingMatch = pathname.match(/^\/api\/pairings\/([a-zA-Z0-9_-]+)$/)
    if (pairingMatch && method === 'GET') {
      const data = await this.options.manager.getPairing(pairingMatch[1], scope)
      if (!data) return json(res, 404, { ok: false, error: 'Vinculación no encontrada.' })
      return json(res, 200, { ok: true, data })
    }
    if (pairingMatch && method === 'DELETE') {
      if (!this.requireSession(req, res, true)) return
      const removed = await this.options.manager.cancelPairing(pairingMatch[1], scope)
      if (!removed) return json(res, 404, { ok: false, error: 'Vinculación no encontrada.' })
      return json(res, 200, { ok: true })
    }

    const botAction = pathname.match(/^\/api\/bots\/(\d+)\/(start|stop)$/)
    if (botAction && method === 'POST') {
      if (!this.requireSession(req, res, true)) return
      const botId = botAction[1]
      if (botAction[2] === 'start') await this.options.manager.startBot(botId, scope)
      else await this.options.manager.stopBot(botId, scope)
      return json(res, 200, { ok: true, data: await this.options.manager.snapshot(scope) })
    }

    const botMatch = pathname.match(/^\/api\/bots\/(\d+)$/)
    if (botMatch && method === 'DELETE') {
      if (!this.requireSession(req, res, true)) return
      await this.options.manager.removeBot(botMatch[1], scope)
      return json(res, 200, { ok: true, data: await this.options.manager.snapshot(scope) })
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
