import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

export type WebAccountRole = 'owner' | 'user'

export type WebAccount = {
  id: string
  phone: string
  passwordHash: string
  role: WebAccountRole
  createdAt: string
}

type AccountData = {
  version: number
  accounts: WebAccount[]
}

const DATA_FILE = path.resolve(
  process.env.SUBBOT_WEB_ACCOUNTS_FILE || path.join('database', 'web-accounts.json')
)
const PHONE = /^\d{7,15}$/
const MIN_PASSWORD = 6
const MAX_PASSWORD = 128

const now = () => new Date().toISOString()

export function normalizeAccountPhone(value: any): string {
  const phone = String(value || '').replace(/\D/g, '')
  if (!PHONE.test(phone)) {
    throw new Error('Indica un teléfono con código de país, solo dígitos (7 a 15).')
  }
  return phone
}

function normalizePassword(value: any): string {
  const password = String(value ?? '')
  if (password.length < MIN_PASSWORD) {
    throw new Error(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`)
  }
  if (password.length > MAX_PASSWORD) {
    throw new Error(`La contraseña no puede superar ${MAX_PASSWORD} caracteres.`)
  }
  return password
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(password, salt, 64)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

function verifyPassword(password: string, stored: string): boolean {
  try {
    const [algorithm, saltHex, hashHex] = String(stored || '').split('$')
    if (algorithm !== 'scrypt' || !saltHex || !hashHex) return false
    const salt = Buffer.from(saltHex, 'hex')
    const expected = Buffer.from(hashHex, 'hex')
    const actual = crypto.scryptSync(password, salt, expected.length)
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}

function normalizeAccount(input: any): WebAccount | null {
  try {
    const role: WebAccountRole = input?.role === 'owner' ? 'owner' : 'user'
    const passwordHash = String(input?.passwordHash || '')
    if (!/^scrypt\$[a-f0-9]+\$[a-f0-9]+$/i.test(passwordHash)) return null
    const storedId = String(input?.id || '').trim()
    return {
      id: /^acc-[a-f0-9]{16}$/.test(storedId)
        ? storedId
        : `acc-${crypto.randomBytes(8).toString('hex')}`,
      phone: normalizeAccountPhone(input?.phone),
      passwordHash,
      role,
      createdAt: new Date(input?.createdAt || now()).toISOString(),
    }
  } catch {
    return null
  }
}

function clone(account: WebAccount): WebAccount {
  return { ...account }
}

class WebAccountStore {
  private data: AccountData = { version: 1, accounts: [] }
  private ready: Promise<void> | null = null
  private queue: Promise<unknown> = Promise.resolve()

  async init(): Promise<void> {
    if (!this.ready) this.ready = this.load()
    return this.ready
  }

  private async load(): Promise<void> {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true })
    let parsed: any = null
    try {
      parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
    } catch {}
    const seen = new Set<string>()
    const accounts = (Array.isArray(parsed?.accounts) ? parsed.accounts : [])
      .map(normalizeAccount)
      .filter((account): account is WebAccount => {
        if (!account || !account.id || seen.has(account.phone)) return false
        seen.add(account.phone)
        return true
      })
    this.data = { version: 1, accounts }
    await this.write()
  }

  private async write(): Promise<void> {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true })
    const temporary = `${DATA_FILE}.${process.pid}.${Date.now()}.tmp`
    await fs.promises.writeFile(temporary, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8')
    await fs.promises.rename(temporary, DATA_FILE)
  }

  private async mutate<T>(handler: (data: AccountData) => T): Promise<T> {
    await this.init()
    const operation = this.queue.then(async () => {
      const result = handler(this.data)
      await this.write()
      return result
    })
    this.queue = operation.catch(() => undefined)
    return operation
  }

  async findByPhone(phone: string): Promise<WebAccount | null> {
    await this.init()
    const value = String(phone || '').replace(/\D/g, '')
    const account = this.data.accounts.find(item => item.phone === value)
    return account ? clone(account) : null
  }

  async register(input: { phone: any; password: any }): Promise<WebAccount> {
    const phone = normalizeAccountPhone(input?.phone)
    const password = normalizePassword(input?.password)
    const passwordHash = hashPassword(password)
    return this.mutate(data => {
      if (data.accounts.some(item => item.phone === phone)) {
        const error: any = new Error('Ya existe una cuenta con ese teléfono.')
        error.statusCode = 409
        throw error
      }
      const account: WebAccount = {
        id: `acc-${crypto.randomBytes(8).toString('hex')}`,
        phone,
        passwordHash,
        role: 'user',
        createdAt: now(),
      }
      data.accounts.push(account)
      return clone(account)
    })
  }

  async verify(phone: any, password: any): Promise<WebAccount | null> {
    const value = String(phone || '').replace(/\D/g, '')
    if (!PHONE.test(value)) return null
    const account = await this.findByPhone(value)
    if (!account) return null
    if (!verifyPassword(String(password ?? ''), account.passwordHash)) return null
    return clone(account)
  }

  async ensureOwner(phone: any, password: any): Promise<WebAccount> {
    const value = normalizeAccountPhone(phone)
    const passwordValue = normalizePassword(password)
    if (['cambia-esta-clave', 'una-clave-segura'].includes(passwordValue.toLowerCase())) {
      throw new Error('Cambia la contraseña de administrador por una diferente.')
    }
    const passwordHash = hashPassword(passwordValue)
    return this.mutate(data => {
      const existing = data.accounts.find(item => item.phone === value)
      if (existing) {
        existing.passwordHash = passwordHash
        existing.role = 'owner'
        return clone(existing)
      }
      const account: WebAccount = {
        id: `acc-${crypto.randomBytes(8).toString('hex')}`,
        phone: value,
        passwordHash,
        role: 'owner',
        createdAt: now(),
      }
      data.accounts.push(account)
      return clone(account)
    })
  }
}

export const webAccountStore = new WebAccountStore()
