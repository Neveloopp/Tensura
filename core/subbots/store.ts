import fs from 'fs'
import path from 'path'

export type SubBotRecord = {
  botId: string
  name: string
  phone: string
  sessionId: string
  managerPhone: string
  enabled: boolean
  createdAt: string
  lastStartedAt: string | null
  lastStoppedAt: string | null
  lastError: string | null
}

type StoreData = {
  version: number
  bots: SubBotRecord[]
}

const DATA_FILE = path.resolve(process.env.SUBBOT_DATA_FILE || 'database/subbots.json')
const BOT_ID = /^\d{6,24}$/
const SESSION_ID = /^[a-zA-Z0-9_-]{8,80}$/
const PHONE = /^\d{7,15}$/

const now = () => new Date().toISOString()

export function normalizeSubBotId(value: any): string {
  const id = String(value || '')
    .trim()
    .split('@')[0]
    .split(':')[0]
    .replace(/\D/g, '')
  if (!BOT_ID.test(id)) throw new Error('El ID del sub bot no es válido.')
  return id
}

export function normalizeSubBotPhone(value: any): string {
  const phone = String(value || '').replace(/\D/g, '')
  if (!PHONE.test(phone)) {
    throw new Error('Indica el número con código de país, solo dígitos (7 a 15).')
  }
  return phone
}

function normalizeSessionId(value: any): string {
  const id = String(value || '').trim()
  if (!SESSION_ID.test(id)) throw new Error('La sesión del sub bot no es válida.')
  return id
}

function text(value: any, max = 160): string {
  return String(value ?? '').trim().slice(0, max)
}

function optionalDate(value: any): string | null {
  const raw = String(value || '').trim()
  if (!raw) return null
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function normalizeRecord(input: any): SubBotRecord | null {
  try {
    const botId = normalizeSubBotId(input?.botId)
    const phone = String(input?.phone || botId).replace(/\D/g, '').slice(0, 15)
    const managerPhone = String(input?.managerPhone || '').replace(/\D/g, '').slice(0, 15)
    return {
      botId,
      name: text(input?.name, 80) || phone || botId,
      phone,
      sessionId: normalizeSessionId(input?.sessionId),
      managerPhone,
      enabled: input?.enabled !== false,
      createdAt: optionalDate(input?.createdAt) || now(),
      lastStartedAt: optionalDate(input?.lastStartedAt),
      lastStoppedAt: optionalDate(input?.lastStoppedAt),
      lastError: input?.lastError ? text(input.lastError, 500) : null,
    }
  } catch {
    return null
  }
}

function clone(record: SubBotRecord): SubBotRecord {
  return { ...record }
}

class SubBotStore {
  private data: StoreData = { version: 1, bots: [] }
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
    const bots = (Array.isArray(parsed?.bots) ? parsed.bots : [])
      .map(normalizeRecord)
      .filter((record): record is SubBotRecord => {
        if (!record || seen.has(record.botId)) return false
        seen.add(record.botId)
        return true
      })
    this.data = { version: 1, bots }
    await this.write()
  }

  private async write(): Promise<void> {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true })
    const temporary = `${DATA_FILE}.${process.pid}.${Date.now()}.tmp`
    await fs.promises.writeFile(temporary, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8')
    await fs.promises.rename(temporary, DATA_FILE)
  }

  private async mutate<T>(handler: (data: StoreData) => T): Promise<T> {
    await this.init()
    const operation = this.queue.then(async () => {
      const result = handler(this.data)
      await this.write()
      return result
    })
    this.queue = operation.catch(() => undefined)
    return operation
  }

  async list(): Promise<SubBotRecord[]> {
    await this.init()
    return this.data.bots.map(clone)
  }

  async get(botId: string): Promise<SubBotRecord | null> {
    await this.init()
    const id = String(botId || '').replace(/\D/g, '')
    const record = this.data.bots.find(item => item.botId === id)
    return record ? clone(record) : null
  }

  async getEnabled(): Promise<SubBotRecord[]> {
    await this.init()
    return this.data.bots.filter(item => item.enabled).map(clone)
  }

  async create(input: Omit<SubBotRecord, 'createdAt' | 'lastStartedAt' | 'lastStoppedAt' | 'lastError'>): Promise<SubBotRecord> {
    return this.mutate(data => {
      const record = normalizeRecord({ ...input, createdAt: now() })
      if (!record) throw new Error('Los datos del sub bot no son válidos.')
      if (data.bots.some(item => item.botId === record.botId)) {
        throw new Error('Ese sub bot ya está vinculado.')
      }
      data.bots.push(record)
      return clone(record)
    })
  }

  async replaceSession(
    botId: string,
    patch: { sessionId: string; name?: string; phone?: string; managerPhone?: string }
  ): Promise<SubBotRecord> {
    return this.mutate(data => {
      const id = normalizeSubBotId(botId)
      const record = data.bots.find(item => item.botId === id)
      if (!record) throw new Error('El sub bot ya no existe.')
      record.sessionId = normalizeSessionId(patch.sessionId)
      if (patch.name) record.name = text(patch.name, 80)
      if (patch.phone) record.phone = String(patch.phone).replace(/\D/g, '').slice(0, 15)
      if (patch.managerPhone) record.managerPhone = String(patch.managerPhone).replace(/\D/g, '').slice(0, 15)
      record.enabled = true
      record.lastError = null
      return clone(record)
    })
  }

  async update(botId: string, patch: Partial<Pick<SubBotRecord, 'name' | 'enabled' | 'lastError'>>): Promise<SubBotRecord> {
    return this.mutate(data => {
      const id = String(botId || '').replace(/\D/g, '')
      const record = data.bots.find(item => item.botId === id)
      if (!record) throw new Error('Sub bot no encontrado.')
      if (Object.prototype.hasOwnProperty.call(patch, 'name')) record.name = text(patch.name, 80) || record.name
      if (Object.prototype.hasOwnProperty.call(patch, 'enabled')) record.enabled = Boolean(patch.enabled)
      if (Object.prototype.hasOwnProperty.call(patch, 'lastError')) {
        record.lastError = patch.lastError ? text(patch.lastError, 500) : null
      }
      return clone(record)
    })
  }

  async setEnabled(botId: string, enabled: boolean): Promise<SubBotRecord> {
    return this.update(botId, { enabled })
  }

  async markStarted(botId: string): Promise<SubBotRecord | null> {
    return this.mutate(data => {
      const record = data.bots.find(item => item.botId === String(botId || ''))
      if (!record) return null
      record.lastStartedAt = now()
      record.lastError = null
      return clone(record)
    })
  }

  async markStopped(botId: string): Promise<SubBotRecord | null> {
    return this.mutate(data => {
      const record = data.bots.find(item => item.botId === String(botId || ''))
      if (!record) return null
      record.lastStoppedAt = now()
      return clone(record)
    })
  }

  async markError(botId: string, error: any): Promise<SubBotRecord | null> {
    return this.mutate(data => {
      const record = data.bots.find(item => item.botId === String(botId || ''))
      if (!record) return null
      record.lastError = text(error?.message || error || 'Error desconocido', 500)
      return clone(record)
    })
  }

  async remove(botId: string): Promise<SubBotRecord | null> {
    return this.mutate(data => {
      const id = String(botId || '').replace(/\D/g, '')
      const index = data.bots.findIndex(item => item.botId === id)
      if (index === -1) throw new Error('Sub bot no encontrado.')
      const [record] = data.bots.splice(index, 1)
      return clone(record)
    })
  }
}

export const subBotStore = new SubBotStore()
