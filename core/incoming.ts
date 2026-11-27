import botConfig from '../settings.ts'
import { getChat, getSettings } from './system/database.ts'
import { getMessageText, isGroupJid, isLink, normalizeJid } from './utils.ts'

const NO_PREFIX = new Set(['menu', 'help', 'allmenu'])
const SEEN_TTL = 30_000
const SEEN_LIMIT = 5_000
const seen = new Map<string, number>()

function prefixesFor(sock: any): string[] {
  const me = sock?.user || sock?.authState?.creds?.me || {}
  const botId = normalizeJid(me?.phoneNumber || me?.id || me?.lid || '')
  const configured = botId ? getSettings(botId)?.prefijo : null
  const value = configured ?? botConfig.prefixes
  const list = Array.isArray(value) ? value : typeof value === 'string' ? [value] : []
  return list.map(item => String(item || '')).filter(Boolean)
}

function messageKey(raw: any): string {
  const id = String(raw?.key?.id || '')
  if (!id) return ''
  const chat = normalizeJid(raw?.key?.remoteJid)
  return chat ? `${chat}:${id}` : id
}

export function shouldProcessIncoming(sock: any, raw: any): boolean {
  try {
    if (!raw?.message) return false

    const chat = normalizeJid(raw?.key?.remoteJid)
    if (!chat || chat === 'status@broadcast') return false

    const id = String(raw?.key?.id || '')
    if (id.startsWith('BAE5') && id.length === 16) return false

    const body = String(getMessageText(raw.message) || '').trim()
    if (!body) return false

    const prefix = prefixesFor(sock).find(item => body.startsWith(item)) || ''
    const group = isGroupJid(chat)
    if (raw.key?.fromMe && (group || !prefix)) return false
    if (prefix) return true

    const command = body.split(/\s+/)[0].toLowerCase()
    if (NO_PREFIX.has(command)) return true

    if (group && isLink(body)) {
      const data = getChat(chat)
      return Boolean(data?.moderation?.antiLinks)
    }

    return false
  } catch {
    return true
  }
}

export function claimIncoming(raw: any): boolean {
  const key = messageKey(raw)
  if (!key) return true

  const now = Date.now()
  const until = seen.get(key)
  if (until && until > now) return false

  seen.set(key, now + SEEN_TTL)
  if (seen.size > SEEN_LIMIT) {
    for (const [item, expires] of seen) {
      if (expires <= now) seen.delete(item)
    }
    const target = Math.floor(SEEN_LIMIT * 0.8)
    while (seen.size > target) {
      const oldest = seen.keys().next().value
      if (!oldest) break
      seen.delete(oldest)
    }
  }
  return true
}
