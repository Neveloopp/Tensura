/*
 * Utilidades generales de Tensura.
 */
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import moment from 'moment-timezone'
import { jidDecode, getContentType } from '@whiskeysockets/baileys'
import botConfig from '../settings.ts'

const groupMetaCache = new Map<string, { data: any; ts: number }>()
const groupMetaPending = new Map<string, Promise<any>>()
const groupMetaVersion = new Map<string, number>()
const lidCache = new Map<string, { data: string; ts: number }>()
const lidPending = new Map<string, Promise<string>>()
const META_TTL = 5 * 60 * 1000
const LID_TTL = 24 * 60 * 60 * 1000
const META_TIMEOUT = 8000
const LID_TIMEOUT = 3000
const botLidCache = new Map<string, string>()

export const TMP_DIR = path.resolve('core/system/tmp')

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>(resolve => {
    let settled = false
    const finish = (value: T) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => finish(fallback), ms)
    timer.unref?.()
    promise.then(finish, () => finish(fallback))
  })
}

export function normalizeJid(raw: any): string {
  if (!raw) return ''
  const value = String(raw).trim()
  if (!value) return ''
  if (/:\d+@/.test(value)) {
    const decoded = jidDecode(value)
    if (decoded?.user && decoded?.server) return `${decoded.user}@${decoded.server}`
  }
  if (value.includes('@')) return value
  const digits = value.replace(/\D/g, '')
  return digits ? `${digits}@s.whatsapp.net` : value
}

export function jidNumber(jid: any): string {
  return String(jid || '')
    .split('@')[0]
    .split(':')[0]
    .replace(/\D/g, '')
}

export function isGroupJid(jid: any): boolean {
  return String(jid || '').endsWith('@g.us')
}

export function isUserJid(jid: any): boolean {
  return String(jid || '').endsWith('@s.whatsapp.net')
}

export function isUrl(text: any): boolean {
  return /^https?:\/\/\S+/i.test(String(text || '').trim())
}

export function extractUrl(text: any): string {
  const match = String(text || '').match(/https?:\/\/[^\s]+/i)
  return match ? match[0] : ''
}

export function isLink(text: any): boolean {
  return /(?:https?:\/\/|www\.|chat\.whatsapp\.com\/|wa\.me\/|discord\.gg\/|t\.me\/|tiktok\.com\/|instagram\.com\/|facebook\.com\/)/i.test(
    String(text || '')
  )
}

export function escapeRegExp(text: string) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export function formatBytes(bytes: number): string {
  const value = Number(bytes || 0)
  if (!value) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`
}

export function formatMs(ms: number): string {
  const seconds = Math.floor(Number(ms || 0) / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  return [
    days && `${days}d`,
    `${hours % 24}h`,
    `${minutes % 60}m`,
    `${seconds % 60}s`,
  ]
    .filter(Boolean)
    .join(' ')
}

export function formatDate(timezone = botConfig.timezone) {
  return moment().tz(timezone).format('DD/MM/YYYY')
}

export function formatClock(timezone = botConfig.timezone) {
  return moment().tz(timezone).format('hh:mm A')
}

export function greeting(timezone = botConfig.timezone) {
  const hour = Number(moment().tz(timezone).format('HH'))
  if (hour < 12) return 'Buenos días'
  if (hour < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

export function renderTemplate(template: string, values: Record<string, any>) {
  return String(template || '').replace(/\{([a-záéíóúñ_]+)\}/gi, (match, token) => {
    const key = String(token || '').toLowerCase()
    return Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  })
}

export function sanitizeFilename(value: any, fallback = 'archivo'): string {
  const cleaned = String(value || '')
    .replace(/[\\/:*?"<>|\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 170)
  return cleaned || fallback
}

export function ensureTmpDir() {
  fs.mkdirSync(TMP_DIR, { recursive: true })
  return TMP_DIR
}

export function tempFile(prefix: string, extension = ''): string {
  ensureTmpDir()
  const ext = extension ? (extension.startsWith('.') ? extension : `.${extension}`) : ''
  return path.join(TMP_DIR, `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`)
}

export function removeFile(file: string | null | undefined) {
  if (!file) return
  try {
    fs.rmSync(file, { force: true })
  } catch {}
}

export function removeFiles(...files: (string | null | undefined)[]) {
  for (const file of files) removeFile(file)
}

export function extensionFromMime(mime: string, fallback = '.bin') {
  const value = String(mime || '').toLowerCase()
  if (value.includes('jpeg') || value.includes('jpg')) return '.jpg'
  if (value.includes('png')) return '.png'
  if (value.includes('webp')) return '.webp'
  if (value.includes('gif')) return '.gif'
  if (value.includes('mp4')) return '.mp4'
  if (value.includes('quicktime')) return '.mov'
  if (value.includes('webm')) return '.webm'
  if (value.includes('mpeg') || value.includes('mp3')) return '.mp3'
  if (value.includes('ogg') || value.includes('opus')) return '.ogg'
  if (value.includes('pdf')) return '.pdf'
  if (value.includes('zip')) return '.zip'
  if (value.includes('rar')) return '.rar'
  if (value.includes('android')) return '.apk'
  return fallback
}

// ── Mensajes ────────────────────────────────────────────────────
export function unwrapMessage(message: any): any {
  if (!message || typeof message !== 'object') return message
  if (message.ephemeralMessage?.message) return unwrapMessage(message.ephemeralMessage.message)
  if (message.viewOnceMessage?.message) return unwrapMessage(message.viewOnceMessage.message)
  if (message.viewOnceMessageV2?.message) return unwrapMessage(message.viewOnceMessageV2.message)
  if (message.viewOnceMessageV2Extension?.message) return unwrapMessage(message.viewOnceMessageV2Extension.message)
  if (message.documentWithCaptionMessage?.message) return unwrapMessage(message.documentWithCaptionMessage.message)
  if (message.editedMessage?.message) return unwrapMessage(message.editedMessage.message)
  return message
}

export function messageType(message: any): string {
  return getContentType(unwrapMessage(message)) || ''
}

const VIEW_ONCE_WRAPPERS = [
  'viewOnceMessage',
  'viewOnceMessageV2',
  'viewOnceMessageV2Extension',
] as const
const VIEW_ONCE_TYPES = [
  'imageMessage',
  'videoMessage',
  'audioMessage',
  'extendedTextMessage',
  'documentMessage',
] as const
const VIEW_ONCE_CONTAINERS = ['ephemeralMessage', 'documentWithCaptionMessage', 'editedMessage'] as const

export function isViewOnceMessage(message: any): boolean {
  if (!message || typeof message !== 'object') return false

  if (VIEW_ONCE_WRAPPERS.some(key => Boolean(message[key]?.message))) return true
  if (VIEW_ONCE_TYPES.some(key => message[key]?.viewOnce === true)) return true

  return VIEW_ONCE_CONTAINERS.some(key => {
    const inner = message[key]?.message
    return inner ? isViewOnceMessage(inner) : false
  })
}

export function getMessageText(message: any): string {
  const msg = unwrapMessage(message)
  if (!msg) return ''
  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.documentMessage?.caption ||
    msg.buttonsResponseMessage?.selectedButtonId ||
    msg.listResponseMessage?.singleSelectReply?.selectedRowId ||
    msg.templateButtonReplyMessage?.selectedId ||
    msg.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
    ''
  )
}

export function getContextInfo(message: any): any {
  const msg = unwrapMessage(message)
  if (!msg) return null
  const type = getContentType(msg)
  return type ? msg[type]?.contextInfo || null : null
}

// ── Grupos / LID ────────────────────────────────────────────────
export async function getCachedGroupMeta(sock: any, jid: string) {
  if (!isGroupJid(jid)) return null
  const now = Date.now()
  const cached = groupMetaCache.get(jid)
  if (cached && now - cached.ts < META_TTL) return cached.data

  const pending = groupMetaPending.get(jid)
  if (pending) return pending

  const version = groupMetaVersion.get(jid) || 0
  let request: Promise<any>
  try {
    request = Promise.resolve(sock.groupMetadata(jid))
  } catch {
    return null
  }

  const task = withTimeout(request, META_TIMEOUT, null)
    .then(data => {
      if (data && (groupMetaVersion.get(jid) || 0) === version) {
        groupMetaCache.set(jid, { data, ts: Date.now() })
      }
      return data
    })
    .catch(() => null)
    .finally(() => {
      if (groupMetaPending.get(jid) === task) groupMetaPending.delete(jid)
    })

  groupMetaPending.set(jid, task)
  return task
}

function uniqueJids(values: any[]): string[] {
  return [...new Set(values.map(normalizeJid).filter(Boolean))]
}

export function participantJids(participant: any): string[] {
  return uniqueJids([participant?.id, participant?.jid, participant?.phoneNumber, participant?.lid])
}

export function jidsMatch(a: any, b: any): boolean {
  const left = normalizeJid(a)
  const right = normalizeJid(b)
  if (!left || !right) return false
  if (left === right) return true
  const leftDigits = jidNumber(left)
  return !!leftDigits && leftDigits === jidNumber(right)
}

export function findGroupParticipant(meta: any, jid: any): any {
  const targets = (Array.isArray(jid) ? jid : [jid]).map(normalizeJid).filter(Boolean)
  if (!targets.length) return null
  for (const participant of meta?.participants || []) {
    const ids = participantJids(participant)
    if (targets.some(target => ids.some(id => jidsMatch(target, id)))) return participant
  }
  return null
}

function participantIsAdmin(participant: any): boolean {
  return participant?.admin === 'admin' || participant?.admin === 'superadmin'
}

export function invalidateGroupMeta(jid: string) {
  const target = normalizeJid(jid)
  if (!target) return
  groupMetaCache.delete(target)
  groupMetaPending.delete(target)
  groupMetaVersion.set(target, (groupMetaVersion.get(target) || 0) + 1)
}

export function botIdentityJids(sock: any): string[] {
  const me = sock?.user || {}
  const credsMe = sock?.authState?.creds?.me || {}
  return uniqueJids([
    me?.id,
    me?.phoneNumber,
    me?.lid,
    credsMe?.id,
    credsMe?.phoneNumber,
    credsMe?.lid,
  ])
}

async function botIdsWithLid(sock: any): Promise<string[]> {
  const ids = botIdentityJids(sock)
  if (ids.some(id => id.endsWith('@lid'))) return ids

  const pn = ids.find(id => id.endsWith('@s.whatsapp.net'))
  if (!pn) return ids

  const cached = botLidCache.get(pn)
  if (cached) return uniqueJids([...ids, cached])

  try {
    const mapping = sock?.signalRepository?.lidMapping
    if (typeof mapping?.getLIDForPN !== 'function') return ids
    const lid = normalizeJid(
      await withTimeout(Promise.resolve(mapping.getLIDForPN(pn)), LID_TIMEOUT, '')
    )
    if (!lid.endsWith('@lid')) return ids
    botLidCache.set(pn, lid)
    return uniqueJids([...ids, lid])
  } catch {
    return ids
  }
}

function metaHasAdmin(meta: any, jids: string[]): boolean {
  if (!meta?.participants?.length || !jids.length) return false
  return meta.participants.some((participant: any) => {
    if (!participantIsAdmin(participant)) return false
    const ids = participantJids(participant)
    return jids.some(jid => ids.some(id => jidsMatch(jid, id)))
  })
}

export async function isJidAdminInGroup(sock: any, groupJid: string, jid: string, force = false): Promise<boolean> {
  if (!isGroupJid(groupJid) || !jid) return false
  if (force) invalidateGroupMeta(groupJid)
  const meta = await getCachedGroupMeta(sock, groupJid)
  const participant = findGroupParticipant(meta, jid)
  return participantIsAdmin(participant)
}

export async function isBotAdminInGroup(sock: any, groupJid: string, force = false, lookupLid = true): Promise<boolean> {
  if (!isGroupJid(groupJid)) return false
  if (force) invalidateGroupMeta(groupJid)
  const meta = await getCachedGroupMeta(sock, groupJid)
  if (!meta?.participants) return false

  const ids = botIdentityJids(sock)
  if (metaHasAdmin(meta, ids)) return true
  if (!lookupLid) return false

  const expanded = await botIdsWithLid(sock)
  return expanded.length !== ids.length && metaHasAdmin(meta, expanded)
}

export async function resolveLidToRealJid(jid: string, sock: any, groupJid = ''): Promise<string> {
  const target = normalizeJid(jid)
  if (!target.endsWith('@lid')) return target

  const cached = lidCache.get(target)
  if (cached && Date.now() - cached.ts < LID_TTL) return cached.data

  try {
    const mapping = sock?.signalRepository?.lidMapping
    if (typeof mapping?.getPNForLID === 'function') {
      let pending = lidPending.get(target)
      if (!pending) {
        pending = withTimeout(Promise.resolve(mapping.getPNForLID(target)), LID_TIMEOUT, '')
          .then(pn => normalizeJid(pn))
          .finally(() => lidPending.delete(target))
        lidPending.set(target, pending)
      }
      const resolved = await pending
      if (resolved && !resolved.endsWith('@lid')) {
        lidCache.set(target, { data: resolved, ts: Date.now() })
        return resolved
      }
    }
  } catch {}

  if (groupJid) {
    try {
      const meta = await getCachedGroupMeta(sock, groupJid)
      const base = target.split('@')[0]
      for (const participant of meta?.participants || []) {
        const lid = normalizeJid(participant?.lid)
        const id = normalizeJid(participant?.id)
        if (lid.split('@')[0] !== base && id.split('@')[0] !== base) continue
        const phone = normalizeJid(participant?.phoneNumber) || (id && !id.endsWith('@lid') ? id : '')
        if (phone && !phone.endsWith('@lid')) {
          lidCache.set(target, { data: phone, ts: Date.now() })
          return phone
        }
      }
    } catch {}
  }

  return target
}

export function mentionJid(jid: string): string {
  return `@${jidNumber(jid)}`
}

export function displayNameFromJid(jid: string): string {
  return jidNumber(jid) || String(jid || '')
}
