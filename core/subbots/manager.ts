import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { createRequire } from 'module'
import pino from 'pino'
import {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  makeWASocket,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys'
import handler from '../../handler.ts'
import groupEvents from '../../cmds/events.ts'
import { patchAudioStickerProtocol } from '../audioSticker.ts'
import { smsg } from '../message.ts'
import { rememberAudioSticker } from '../messageCache.ts'
import { isGroupJid, jidNumber, normalizeJid } from '../utils.ts'
import { mainBotIsInGroup } from './mainGroups.ts'
import {
  normalizeSubBotId,
  normalizeSubBotPhone,
  subBotStore,
  type SubBotRecord,
} from './store.ts'

const require = createRequire(import.meta.url)
const QRCode: any = require('qrcode')
const logger = pino({ level: 'silent' })
const SESSION_ROOT = path.resolve(process.env.SUBBOT_SESSION_DIR || path.join('Sessions', 'SubBots'))
const PAIRING_TTL = Math.max(60_000, Number(process.env.SUBBOT_PAIRING_TTL_MS || 180_000))
const SUPERVISOR_INTERVAL = Math.max(15_000, Number(process.env.SUBBOT_SUPERVISOR_MS || 30_000))
const FOLLOW_CHANNEL = String(
  process.env.SUBBOT_FOLLOW_CHANNEL ?? '120363414217688890@newsletter'
).trim()

type PairingMethod = 'qr' | 'code'
type Status = 'pairing' | 'connecting' | 'online' | 'offline' | 'disabled' | 'error'

type Entry = {
  sessionId: string
  sessionDir: string
  botId: string
  name: string
  phone: string
  managerPhone: string
  ownerAccountId: string
  method: PairingMethod | null
  sock: any
  status: Status
  qr: string
  code: string
  error: string
  paired: boolean
  stopRequested: boolean
  reconnectAttempts: number
  reconnectTimer: NodeJS.Timeout | null
  codeTimer: NodeJS.Timeout | null
  codeRequested: boolean
  pairingTimer: NodeJS.Timeout | null
  startedAt: string | null
}

export type SubBotView = {
  botId: string
  name: string
  phone: string
  enabled: boolean
  status: Status
  connected: boolean
  createdAt: string
  lastStartedAt: string | null
  lastStoppedAt: string | null
  lastError: string | null
}

export type PairingView = {
  sessionId: string
  method: PairingMethod | null
  status: Status | 'completed'
  botId: string
  qr: string
  code: string
  error: string
}

export type SubBotSnapshot = {
  main: {
    connected: boolean
    botId: string
    name: string
  }
  stats: {
    total: number
    online: number
    enabled: number
    pairing: number
  }
  bots: SubBotView[]
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function statusFromReason(reason: number): string {
  if (reason === DisconnectReason.loggedOut) return 'La sesión fue cerrada desde WhatsApp.'
  if (reason === DisconnectReason.forbidden) return 'WhatsApp rechazó esta sesión.'
  if (reason === DisconnectReason.badSession) return 'La sesión de WhatsApp no es válida.'
  if (reason === DisconnectReason.connectionReplaced) return 'Otra sesión reemplazó a este sub bot.'
  return reason ? `WhatsApp cerró la conexión (código ${reason}).` : 'Se perdió la conexión con WhatsApp.'
}

function fatalReason(reason: number): boolean {
  return [
    DisconnectReason.loggedOut,
    DisconnectReason.forbidden,
    DisconnectReason.badSession,
    DisconnectReason.connectionReplaced,
  ].includes(reason)
}

export class SubBotManager {
  private instances = new Map<string, Entry>()
  private pending = new Map<string, Entry>()
  private completed = new Map<string, { botId: string; at: number }>()
  private version: [number, number, number] | null = null
  private supervisorTimer: NodeJS.Timeout | null = null
  private shuttingDown = false
  private ready = false

  async init(): Promise<void> {
    if (this.ready) return
    await subBotStore.init()
    this.ready = true
    this.startSupervisor()
  }

  private mainBotId(): string {
    return jidNumber((global as any)?.sock?.user?.id || '')
  }

  private forbidden(): never {
    const error: any = new Error('No tienes permiso para administrar este sub bot.')
    error.statusCode = 403
    throw error
  }

  private assertCanManage(ownerAccountId: string | undefined, recordOwnerAccountId: string) {
    if (ownerAccountId !== undefined && String(recordOwnerAccountId || '') !== String(ownerAccountId)) {
      this.forbidden()
    }
  }

  private sessionDir(sessionId: string): string {
    return path.join(SESSION_ROOT, sessionId)
  }

  private async baileysVersion(): Promise<[number, number, number]> {
    if (this.version) return this.version
    try {
      this.version = (await fetchLatestBaileysVersion()).version as [number, number, number]
    } catch {
      this.version = [2, 3000, 1044006379]
    }
    return this.version
  }

  private createEntry(record: SubBotRecord): Entry {
    return {
      sessionId: record.sessionId,
      sessionDir: this.sessionDir(record.sessionId),
      botId: record.botId,
      name: record.name,
      phone: record.phone,
      managerPhone: record.managerPhone,
      ownerAccountId: record.ownerAccountId,
      method: null,
      sock: null,
      status: record.enabled ? 'offline' : 'disabled',
      qr: '',
      code: '',
      error: '',
      paired: true,
      stopRequested: false,
      reconnectAttempts: 0,
      reconnectTimer: null,
      codeTimer: null,
      codeRequested: false,
      pairingTimer: null,
      startedAt: null,
    }
  }

  private clearConnectionTimers(entry: Entry) {
    if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer)
    if (entry.codeTimer) clearTimeout(entry.codeTimer)
    entry.reconnectTimer = null
    entry.codeTimer = null
  }

  private clearPairingTimer(entry: Entry) {
    if (entry.pairingTimer) clearTimeout(entry.pairingTimer)
    entry.pairingTimer = null
  }

  private clearAllTimers(entry: Entry) {
    this.clearConnectionTimers(entry)
    this.clearPairingTimer(entry)
  }

  private closeSocket(entry: Entry, reason: string) {
    const sock = entry.sock
    entry.sock = null
    try {
      sock?.end?.(new Error(reason))
    } catch {}
    try {
      sock?.ws?.close?.()
    } catch {}
  }

  private async generateQr(entry: Entry, qr: string) {
    try {
      const image = await QRCode.toDataURL(qr, {
        width: 420,
        margin: 1,
        color: { dark: '#07101f', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      })
      if (!entry.paired && !entry.stopRequested) {
        entry.qr = image
        entry.status = 'pairing'
      }
    } catch (error: any) {
      entry.error = `No se pudo generar el QR: ${error?.message || error}`
      entry.status = 'error'
    }
  }

  private async failPairing(entry: Entry, message: string, removeSession = true) {
    if (entry.stopRequested) return
    entry.stopRequested = true
    entry.status = 'error'
    entry.error = String(message || 'No se pudo completar la vinculación.')
    entry.qr = ''
    entry.code = ''
    this.clearAllTimers(entry)
    this.closeSocket(entry, entry.error)
    if (removeSession) {
      await fs.promises.rm(entry.sessionDir, { recursive: true, force: true }).catch(() => undefined)
    }
    entry.pairingTimer = setTimeout(() => {
      if (this.pending.get(entry.sessionId) === entry) this.pending.delete(entry.sessionId)
    }, 10 * 60_000)
    entry.pairingTimer.unref?.()
  }

  private async fatal(entry: Entry, message: string, removeSession = false) {
    entry.status = 'error'
    entry.error = message
    this.clearAllTimers(entry)
    this.closeSocket(entry, message)
    if (entry.botId) {
      await subBotStore.markError(entry.botId, message).catch(() => undefined)
      await subBotStore.setEnabled(entry.botId, false).catch(() => undefined)
      this.instances.delete(entry.botId)
    }
    if (removeSession) {
      await fs.promises.rm(entry.sessionDir, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  private scheduleReconnect(entry: Entry, delayOverride?: number) {
    if (this.shuttingDown || entry.stopRequested || !entry.botId || entry.reconnectTimer) return
    entry.reconnectAttempts += 1
    const delay = delayOverride ?? Math.min(5000 * entry.reconnectAttempts, 60_000)
    entry.reconnectTimer = setTimeout(() => {
      entry.reconnectTimer = null
      void this.connect(entry).catch(error => {
        void this.fatal(entry, String(error?.message || error), false)
      })
    }, delay)
    entry.reconnectTimer.unref?.()
  }

  private async followChannel(entry: Entry, sock: any) {
    if (!/^\d+@newsletter$/.test(FOLLOW_CHANNEL)) return
    if (typeof sock?.newsletterFollow !== 'function') return
    try {
      await sock.newsletterFollow(FOLLOW_CHANNEL)
      console.log(`[subbot:${entry.botId}] Siguiendo canal ${FOLLOW_CHANNEL}`)
    } catch (error: any) {
      console.log(
        `[subbot:${entry.botId}] No se pudo seguir ${FOLLOW_CHANNEL}: ${error?.message || error}`
      )
    }
  }

  private async markOnline(entry: Entry, sock: any) {
    entry.status = 'online'
    entry.error = ''
    entry.qr = ''
    entry.code = ''
    entry.startedAt = entry.startedAt || new Date().toISOString()
    entry.reconnectAttempts = 0
    this.clearConnectionTimers(entry)
    this.clearPairingTimer(entry)
    const name = String(sock?.user?.name || entry.name || entry.botId)
    entry.name = name
    ;(sock as any).__subbot = {
      botId: entry.botId,
      managerPhone: entry.managerPhone,
      ownerAccountId: entry.ownerAccountId,
      sessionId: entry.sessionId,
    }
    ;(sock as any).__subbotManager = this
    patchAudioStickerProtocol()
    await subBotStore.markStarted(entry.botId).catch(() => undefined)
    await subBotStore.update(entry.botId, { name }).catch(() => undefined)
    void this.followChannel(entry, sock)
  }

  private async completePairing(entry: Entry, sock: any, botId: string) {
    if (this.mainBotId() && botId === this.mainBotId()) {
      await this.failPairing(entry, 'No puedes vincular la cuenta principal como sub bot.')
      return
    }

    const name = String(sock?.user?.name || botId)
    const existing = await subBotStore.get(botId)
    if (existing) {
      if (existing.ownerAccountId) {
        if (existing.ownerAccountId !== entry.ownerAccountId) {
          await this.failPairing(entry, 'Ese sub bot ya pertenece a otra cuenta.')
          return
        }
      } else if (
        existing.managerPhone &&
        entry.managerPhone &&
        existing.managerPhone !== entry.managerPhone
      ) {
        await this.failPairing(entry, 'Ese sub bot ya pertenece a otra cuenta.')
        return
      }
      const active = this.instances.get(botId)
      if (active && active !== entry) {
        if (active.status === 'online') {
          await this.failPairing(entry, 'Ese sub bot ya está conectado.')
          return
        }
        active.stopRequested = true
        this.clearAllTimers(active)
        this.closeSocket(active, 'Sub bot reemplazado por una nueva sesión')
        this.instances.delete(botId)
      }
      await subBotStore.replaceSession(botId, {
        sessionId: entry.sessionId,
        name,
        phone: botId,
        managerPhone: entry.managerPhone,
        ownerAccountId: entry.ownerAccountId,
      })
      if (existing.sessionId !== entry.sessionId) {
        await fs.promises.rm(this.sessionDir(existing.sessionId), { recursive: true, force: true }).catch(() => undefined)
      }
    } else {
      await subBotStore.create({
        botId,
        name,
        phone: botId,
        sessionId: entry.sessionId,
        managerPhone: entry.managerPhone,
        ownerAccountId: entry.ownerAccountId,
        enabled: true,
      })
    }

    entry.botId = botId
    entry.name = name
    entry.phone = botId
    entry.paired = true
    entry.stopRequested = false
    entry.status = 'online'
    entry.error = ''
    entry.qr = ''
    entry.code = ''
    entry.startedAt = new Date().toISOString()
    this.pending.delete(entry.sessionId)
    this.instances.set(botId, entry)
    this.completed.set(entry.sessionId, { botId, at: Date.now() })
    if (entry.sock === sock && !entry.stopRequested) {
      await this.markOnline(entry, sock)
    }
  }

  private async handleOpen(entry: Entry, sock: any) {
    let botId = ''
    try {
      botId = normalizeSubBotId(sock?.user?.id || '')
    } catch {
      await this.failPairing(entry, 'WhatsApp no devolvió un número válido para este sub bot.')
      return
    }
    if (!entry.paired) {
      try {
        await this.completePairing(entry, sock, botId)
      } catch (error: any) {
        await this.failPairing(entry, error?.message || 'No se pudo guardar el sub bot.')
      }
      return
    }
    await this.markOnline(entry, sock)
  }

  private handleClose(entry: Entry, sock: any, update: any) {
    if (entry.sock !== sock) return
    entry.sock = null
    entry.status = 'offline'
    this.clearConnectionTimers(entry)

    if (this.shuttingDown || entry.stopRequested) {
      this.clearPairingTimer(entry)
      return
    }

    const error = update?.lastDisconnect?.error as any
    const reason = Number(
      error?.output?.statusCode ||
        error?.output?.payload?.statusCode ||
        error?.statusCode ||
        0
    )
    const message = statusFromReason(reason)

    if (!entry.paired) {
      if (reason === DisconnectReason.restartRequired) {
        this.restartPairing(entry)
        return
      }
      void this.failPairing(entry, message)
      return
    }

    if (fatalReason(reason)) {
      void this.fatal(entry, message, true)
      return
    }

    if (reason === DisconnectReason.restartRequired) {
      entry.error = ''
      this.scheduleReconnect(entry, Math.min(1500 * (entry.reconnectAttempts + 1), 10_000))
      return
    }

    entry.error = message
    this.scheduleReconnect(entry)
  }

  private bindEvents(entry: Entry, sock: any) {
    sock.ev.on('connection.update', (update: any) => {
      if (entry.sock !== sock) return
      if (update?.qr && !entry.paired && entry.method === 'qr') {
        void this.generateQr(entry, String(update.qr))
      }
      if (update?.connection === 'open') {
        void this.handleOpen(entry, sock)
      }
      if (update?.connection === 'close') {
        this.handleClose(entry, sock, update)
      }
    })

    sock.ev.on('messages.upsert', ({ messages, type }: any) => {
      if (type !== 'notify' || !entry.paired || entry.sock !== sock || entry.stopRequested) return
      for (const raw of messages || []) {
        rememberAudioSticker(raw)
        void (async () => {
          try {
            if (!raw?.message || entry.sock !== sock || entry.stopRequested) return
            if (raw.key?.remoteJid === 'status@broadcast') return
            if (String(raw.key?.id || '').startsWith('BAE5') && String(raw.key?.id || '').length === 16) return
            const chat = normalizeJid(raw.key?.remoteJid)
            if (isGroupJid(chat) && (await mainBotIsInGroup(chat))) return
            const m = await smsg(sock, raw)
            await handler(sock, m)
          } catch (error: any) {
            console.log(`[subbot:${entry.botId}] ${error?.message || error}`)
          }
        })()
      }
    })

    sock.ev.on('group-participants.update', async (update: any) => {
      if (!entry.paired || entry.sock !== sock || entry.stopRequested) return
      const groupJid = normalizeJid(update?.id)
      if (!isGroupJid(groupJid) || (await mainBotIsInGroup(groupJid))) return
      try {
        await groupEvents(sock, update)
      } catch (error: any) {
        console.log(`[subbot:${entry.botId}] ${error?.message || error}`)
      }
    })
  }

  private restartPairing(entry: Entry) {
    if (this.shuttingDown || entry.stopRequested) return
    entry.reconnectAttempts += 1
    if (entry.reconnectAttempts > 5) {
      void this.failPairing(entry, 'WhatsApp no completó la vinculación. Genera un QR o código nuevo.')
      return
    }
    entry.status = 'connecting'
    entry.error = ''
    const delay = Math.min(1200 * entry.reconnectAttempts, 5000)
    entry.reconnectTimer = setTimeout(() => {
      entry.reconnectTimer = null
      void this.connect(entry).catch(error => {
        void this.failPairing(entry, error?.message || 'No se pudo reintentar la vinculación.')
      })
    }, delay)
    entry.reconnectTimer.unref?.()
  }

  private scheduleCode(entry: Entry, sock: any, registered: boolean) {
    if (registered || entry.method !== 'code' || !entry.phone || entry.paired || entry.codeRequested) return
    entry.codeTimer = setTimeout(async () => {
      if (entry.sock !== sock || entry.stopRequested || entry.paired) return
      let lastError: any = null
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        if (entry.sock !== sock || entry.stopRequested || entry.paired) return
        try {
          const code = await sock.requestPairingCode(entry.phone)
          if (entry.sock !== sock) return
          entry.code = String(code || '')
          entry.codeRequested = true
          entry.error = ''
          entry.status = 'pairing'
          return
        } catch (error: any) {
          lastError = error
          if (attempt < 3) await wait(4000)
        }
      }
      if (entry.sock === sock && !entry.paired) {
        await this.failPairing(
          entry,
          lastError?.message || 'No se pudo generar el código de vinculación.'
        )
      }
    }, 2500)
    entry.codeTimer.unref?.()
  }

  private async connect(entry: Entry): Promise<void> {
    if (this.shuttingDown || entry.stopRequested) return
    this.clearConnectionTimers(entry)
    entry.status = 'connecting'
    entry.error = ''
    fs.mkdirSync(entry.sessionDir, { recursive: true })

    try {
      const { state, saveCreds } = await useMultiFileAuthState(entry.sessionDir)
      const version = await this.baileysVersion()
      const sock: any = makeWASocket({
        version,
        logger,
        printQRInTerminal: false,
        browser: Browsers.ubuntu('Chrome'),
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        markOnlineOnConnect: false,
        generateHighQualityLinkPreview: true,
        syncFullHistory: false,
        getMessage: async () => undefined,
        keepAliveIntervalMs: 45000,
      })
      entry.sock = sock
      sock.ev.on('creds.update', saveCreds)
      this.bindEvents(entry, sock)
      this.scheduleCode(entry, sock, Boolean(state.creds.registered))
    } catch (error: any) {
      if (!entry.paired) {
        await this.failPairing(entry, error?.message || 'No se pudo iniciar la vinculación.')
      } else {
        await this.fatal(entry, error?.message || 'No se pudo iniciar el sub bot.')
      }
    }
  }

  async startAll(): Promise<void> {
    await this.init()
    const records = await subBotStore.getEnabled()
    await Promise.allSettled(records.map(record => this.startBot(record)))
  }

  async adoptLegacyBots(ownerAccountId: string, managerPhone: string): Promise<number> {
    await this.init()
    return subBotStore.adoptByManagerPhone(managerPhone, ownerAccountId)
  }

  async startBot(
    recordOrId: SubBotRecord | string,
    ownerAccountId?: string
  ): Promise<SubBotView | null> {
    await this.init()
    const record =
      typeof recordOrId === 'string' ? await subBotStore.get(recordOrId) : recordOrId
    if (!record) throw new Error('Sub bot no encontrado.')
    this.assertCanManage(ownerAccountId, record.ownerAccountId)
    const current = this.instances.get(record.botId)
    if (current && !current.stopRequested && current.status !== 'offline' && current.status !== 'error') {
      return this.publicBot(record, current)
    }
    if (current) {
      current.stopRequested = true
      this.clearAllTimers(current)
      this.closeSocket(current, 'Reiniciando sub bot')
      this.instances.delete(record.botId)
    }
    const credsFile = path.join(this.sessionDir(record.sessionId), 'creds.json')
    if (!fs.existsSync(credsFile)) {
      const message = 'La sesión de este sub bot no existe. Elimínalo y vuelve a vincularlo.'
      await subBotStore.markError(record.botId, message)
      await subBotStore.setEnabled(record.botId, false)
      throw new Error(message)
    }
    if (!record.enabled) await subBotStore.setEnabled(record.botId, true)
    const entry = this.createEntry({ ...record, enabled: true })
    entry.status = 'connecting'
    this.instances.set(record.botId, entry)
    await this.connect(entry)
    return this.publicBot({ ...record, enabled: true }, entry)
  }

  async createPairing(input: {
    method: PairingMethod
    phone?: string
    managerPhone: string
    ownerAccountId: string
  }): Promise<PairingView> {
    await this.init()
    if (this.shuttingDown) throw new Error('El sistema se está apagando.')
    const activePairings = [...this.pending.values()].filter(
      entry => !entry.paired && entry.status !== 'error'
    ).length
    if (activePairings >= 3) throw new Error('Hay demasiadas vinculaciones pendientes. Espera un momento.')
    const method: PairingMethod = input.method === 'code' ? 'code' : 'qr'
    const phone = method === 'code' ? normalizeSubBotPhone(input.phone) : ''
    const managerPhone = String(input.managerPhone || '').replace(/\D/g, '').slice(0, 15)
    const ownerAccountId = String(input.ownerAccountId || '').trim().slice(0, 80)
    if (!ownerAccountId) throw new Error('La cuenta no es válida.')
    const sessionId = `sub-${Date.now()}-${crypto.randomBytes(5).toString('hex')}`
    const entry: Entry = {
      sessionId,
      sessionDir: this.sessionDir(sessionId),
      botId: '',
      name: method === 'code' ? `Sub bot ${phone.slice(-4)}` : 'Nuevo sub bot',
      phone,
      managerPhone,
      ownerAccountId,
      method,
      sock: null,
      status: 'pairing',
      qr: '',
      code: '',
      error: '',
      paired: false,
      stopRequested: false,
      reconnectAttempts: 0,
      reconnectTimer: null,
      codeTimer: null,
      codeRequested: false,
      pairingTimer: null,
      startedAt: null,
    }
    this.pending.set(sessionId, entry)
    await this.connect(entry)
    if (!entry.stopRequested) {
      entry.pairingTimer = setTimeout(() => {
        if (!entry.paired && !entry.stopRequested) {
          void this.failPairing(entry, 'La vinculación venció. Genera un QR o código nuevo.')
        }
      }, PAIRING_TTL)
      entry.pairingTimer.unref?.()
    }
    return this.pairingView(entry)
  }

  async getPairing(sessionId: string, ownerAccountId?: string): Promise<PairingView | null> {
    await this.init()
    const id = String(sessionId || '')
    const entry = this.pending.get(id)
    if (entry) {
      if (ownerAccountId !== undefined && entry.ownerAccountId !== ownerAccountId) return null
      return this.pairingView(entry)
    }
    const completed = this.completed.get(id)
    if (completed) {
      const record = await subBotStore.get(completed.botId)
      if (!record || (ownerAccountId !== undefined && record.ownerAccountId !== ownerAccountId)) return null
      return {
        sessionId: id,
        method: null,
        status: 'completed',
        botId: completed.botId,
        qr: '',
        code: '',
        error: '',
      }
    }
    return null
  }

  async cancelPairing(sessionId: string, ownerAccountId?: string): Promise<boolean> {
    await this.init()
    const id = String(sessionId || '')
    const entry = this.pending.get(id)
    if (!entry) return false
    if (ownerAccountId !== undefined && entry.ownerAccountId !== ownerAccountId) return false
    entry.stopRequested = true
    this.clearAllTimers(entry)
    this.closeSocket(entry, 'Vinculación cancelada')
    this.pending.delete(id)
    await fs.promises.rm(entry.sessionDir, { recursive: true, force: true }).catch(() => undefined)
    return true
  }

  async stopBot(botId: string, ownerAccountId?: string): Promise<boolean> {
    await this.init()
    const id = String(botId || '').replace(/\D/g, '')
    const record = await subBotStore.get(id)
    if (ownerAccountId !== undefined && (!record || record.ownerAccountId !== ownerAccountId)) this.forbidden()
    const entry = this.instances.get(id)
    if (entry) {
      entry.stopRequested = true
      this.clearAllTimers(entry)
      this.closeSocket(entry, 'Sub bot desactivado')
      this.instances.delete(id)
    }
    await subBotStore.setEnabled(id, false).catch(() => undefined)
    await subBotStore.markStopped(id).catch(() => undefined)
    return true
  }

  async removeBot(botId: string, ownerAccountId?: string): Promise<boolean> {
    await this.init()
    const id = String(botId || '').replace(/\D/g, '')
    const record = await subBotStore.get(id)
    if (!record) throw new Error('Sub bot no encontrado.')
    this.assertCanManage(ownerAccountId, record.ownerAccountId)
    const entry = this.instances.get(id)
    if (entry) {
      entry.stopRequested = true
      this.clearAllTimers(entry)
      this.closeSocket(entry, 'Sub bot eliminado')
      this.instances.delete(id)
    }
    await subBotStore.remove(id)
    await fs.promises.rm(this.sessionDir(record.sessionId), { recursive: true, force: true }).catch(() => undefined)
    return true
  }

  private publicBot(record: SubBotRecord, entry?: Entry): SubBotView {
    const connected = Boolean(entry?.paired && entry?.status === 'online' && entry?.sock)
    return {
      botId: record.botId,
      name: entry?.name || record.name,
      phone: record.phone || record.botId,
      enabled: record.enabled,
      status: entry?.status || (record.enabled ? 'offline' : 'disabled'),
      connected,
      createdAt: record.createdAt,
      lastStartedAt: record.lastStartedAt,
      lastStoppedAt: record.lastStoppedAt,
      lastError: entry?.error || record.lastError,
    }
  }

  private pairingView(entry: Entry): PairingView {
    return {
      sessionId: entry.sessionId,
      method: entry.method,
      status: entry.status,
      botId: entry.botId,
      qr: entry.qr,
      code: entry.code,
      error: entry.error,
    }
  }

  async snapshot(ownerAccountId?: string): Promise<SubBotSnapshot> {
    await this.init()
    const all = await subBotStore.list()
    const records = ownerAccountId !== undefined
      ? all.filter(record => record.ownerAccountId === ownerAccountId)
      : all
    const bots = records.map(record => this.publicBot(record, this.instances.get(record.botId)))
    const mainSock = (global as any)?.sock
    const pending = [...this.pending.values()].filter(
      entry =>
        !entry.paired &&
        entry.status !== 'error' &&
        (ownerAccountId === undefined || entry.ownerAccountId === ownerAccountId)
    )
    return {
      main: {
        connected: Boolean(mainSock?.user?.id),
        botId: jidNumber(mainSock?.user?.id || ''),
        name: String(mainSock?.user?.name || 'Tensura'),
      },
      stats: {
        total: records.length,
        online: bots.filter(bot => bot.connected).length,
        enabled: records.filter(bot => bot.enabled).length,
        pairing: pending.length,
      },
      bots,
    }
  }

  startSupervisor() {
    if (this.supervisorTimer) return
    this.supervisorTimer = setInterval(() => {
      if (this.shuttingDown) return
      void subBotStore
        .getEnabled()
        .then(records => {
          for (const record of records) {
            const entry = this.instances.get(record.botId)
            if (entry && entry.status !== 'offline' && entry.status !== 'error') continue
            if (entry?.reconnectTimer) continue
            void this.startBot(record).catch(() => undefined)
          }
        })
        .catch(() => undefined)
    }, SUPERVISOR_INTERVAL)
    this.supervisorTimer.unref?.()
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true
    if (this.supervisorTimer) clearInterval(this.supervisorTimer)
    this.supervisorTimer = null
    for (const entry of [...this.pending.values()]) {
      entry.stopRequested = true
      this.clearAllTimers(entry)
      this.closeSocket(entry, 'Apagado')
      await fs.promises.rm(entry.sessionDir, { recursive: true, force: true }).catch(() => undefined)
    }
    this.pending.clear()
    for (const entry of [...this.instances.values()]) {
      entry.stopRequested = true
      this.clearAllTimers(entry)
      this.closeSocket(entry, 'Apagado')
    }
    this.instances.clear()
  }
}

export const subBotManager = new SubBotManager()
