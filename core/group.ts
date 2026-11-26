/*
 * Helpers exclusivos de grupos: objetivos, permisos,
 * advertencias y plantillas de bienvenida.
 */
import { getChat, updateChat } from './system/database.ts'
import {
  botIdentityJids,
  findGroupParticipant,
  getCachedGroupMeta,
  invalidateGroupMeta,
  isBotAdminInGroup,
  isJidAdminInGroup,
  jidNumber,
  jidsMatch,
  normalizeJid,
  participantJids,
  renderTemplate,
  resolveLidToRealJid,
} from './utils.ts'

export function botJid(sock: any): string {
  const me = sock?.user || sock?.authState?.creds?.me || {}
  return normalizeJid(me?.phoneNumber || me?.id || me?.lid || '')
}

export function isBotIdentity(sock: any, jid: string): boolean {
  const targets = (Array.isArray(jid) ? jid : [jid]).map(normalizeJid).filter(Boolean)
  return botIdentityJids(sock).some(id => targets.some(target => jidsMatch(id, target)))
}

export async function ensureGroup(m: any) {
  if (!m?.isGroup) throw new Error('Este comando solo funciona en grupos.')
}

export async function ensureAdmin(sock: any, m: any) {
  await ensureGroup(m)
  const admin = await isJidAdminInGroup(sock, m.chat, m.sender)
  if (!admin) throw new Error('Solo un administrador del grupo puede usar este comando.')
  return true
}

export async function ensureBotAdmin(sock: any, m: any) {
  await ensureGroup(m)
  const admin = await isBotAdminInGroup(sock, m.chat)
  if (!admin) throw new Error('Necesito ser administrador del grupo para hacer eso.')
  return true
}

async function makeTarget(sock: any, m: any, rawJid: string, consumed: number, quoted: boolean) {
  const raw = normalizeJid(rawJid)
  if (!raw) return null
  const resolved = normalizeJid(await resolveLidToRealJid(raw, sock, m.chat)) || raw
  const meta = await getCachedGroupMeta(sock, m.chat)
  const participant = findGroupParticipant(meta, [raw, resolved])
  const jids = [...new Set([raw, resolved, ...participantJids(participant)])]
  const phone = jids.find(jid => jid.endsWith('@s.whatsapp.net'))
  const lid = jids.find(jid => jid.endsWith('@lid'))
  return {
    jid: phone || resolved || raw,
    lid: lid || '',
    jids,
    participant,
    consumed,
    quoted,
  }
}

export async function getTarget(sock: any, m: any, args: string[] = []) {
  if (m?.quoted?.sender) {
    return makeTarget(sock, m, m.quoted.sender, 0, true)
  }

  const mentioned = m?.mentionedJid?.[0]
  if (mentioned) {
    const consumed = args.findIndex(arg => String(arg).includes(jidNumber(mentioned))) + 1 || 1
    return makeTarget(sock, m, mentioned, consumed, false)
  }

  const index = args.findIndex(arg => /^\+?\d{8,16}$/.test(String(arg).replace(/[\s-]/g, '')))
  if (index >= 0) {
    const digits = String(args[index]).replace(/\D/g, '')
    if (digits) return makeTarget(sock, m, `${digits}@s.whatsapp.net`, index + 1, false)
  }

  return null
}

function groupActionFailure(result: any) {
  if (!Array.isArray(result) || !result.length) return null
  const failed = result.find((item: any) => String(item?.status ?? '200') !== '200')
  if (!failed) return null
  return String(failed?.status ?? '')
}

function groupActionError(status: string) {
  if (status === '403') return 'WhatsApp rechazó la acción: necesito ser administrador del grupo.'
  if (status === '404' || status === '409') return 'Ese miembro ya no está en el grupo.'
  if (status === '400') return 'WhatsApp rechazó la acción. Verifica el número o los permisos del grupo.'
  return status ? `WhatsApp respondió con error ${status}.` : 'WhatsApp no confirmó la acción.'
}

export async function updateGroupParticipant(sock: any, groupJid: string, target: any, action: string) {
  const inputs = (Array.isArray(target) ? target : [target])
    .flatMap((value: any) =>
      typeof value === 'string' ? [value] : [value?.participantJid, value?.lid, value?.jid, ...(value?.jids || [])]
    )
    .map(normalizeJid)
    .filter(Boolean)
  const unique = [...new Set(inputs)]
  if (!unique.length) return { ok: false, error: 'No se indicó a qué miembro modificar.' }

  const meta = await getCachedGroupMeta(sock, groupJid)
  const participant = findGroupParticipant(meta, unique)
  const candidates = [...new Set([
    ...(participant ? [participant?.id, participant?.lid, participant?.phoneNumber] : []),
    ...unique,
  ].map(normalizeJid).filter(Boolean))]

  let lastStatus = ''
  let lastError = ''
  for (const jid of candidates) {
    try {
      const result = await sock.groupParticipantsUpdate(groupJid, [jid], action)
      const failure = groupActionFailure(result)
      if (!failure) {
        invalidateGroupMeta(groupJid)
        return { ok: true, jid, result }
      }
      lastStatus = failure
    } catch (error: any) {
      lastError = String(error?.message || error || '')
    }
  }

  return { ok: false, error: groupActionError(lastStatus || lastError), status: lastStatus }
}

export async function removeGroupParticipant(sock: any, groupJid: string, target: any) {
  return updateGroupParticipant(sock, groupJid, target, 'remove')
}

export async function participantJid(sock: any, groupJid: string, jid: string) {
  return resolveLidToRealJid(jid, sock, groupJid)
}

export async function memberValues(sock: any, groupJid: string, jid: string) {
  const meta = await getCachedGroupMeta(sock, groupJid)
  const target = normalizeJid(jid)
  const digits = jidNumber(target)
  const participant = (meta?.participants || []).find((item: any) => {
    const ids = [item?.id, item?.jid, item?.phoneNumber, item?.lid].filter(Boolean).map(normalizeJid)
    return ids.includes(target) || ids.some((id: string) => jidNumber(id) === digits)
  })

  const name = participant?.notify || participant?.name || digits || 'Usuario'
  return {
    nombre: name,
    mencion: digits ? `@${digits}` : name,
    usuario: digits ? `@${digits}` : name,
    id: digits,
    grupo: meta?.subject || 'el grupo',
    miembros: String(meta?.participants?.length || 0),
  }
}

export function applyTemplate(template: string, values: Record<string, any>) {
  return renderTemplate(template, values)
}

export async function addWarning(sock: any, m: any, targetJid: string, reason = 'Sin motivo indicado') {
  const chat = getChat(m.chat)
  const key = jidNumber(targetJid)
  const current = chat.warnings[key] || { count: 0, entries: [] }
  current.count += 1
  current.entries.push({
    reason,
    by: jidNumber(m.sender),
    at: new Date().toISOString(),
  })
  current.entries = current.entries.slice(-20)
  chat.warnings[key] = current

  const limit = Math.max(1, Number(chat.moderation?.warnLimit || 3))
  let kicked = false

  if (current.count >= limit) {
    const botIsAdmin = await isBotAdminInGroup(sock, m.chat).catch(() => false)
    if (botIsAdmin) {
      const result = await removeGroupParticipant(sock, m.chat, targetJid)
      if (result.ok) {
        delete chat.warnings[key]
        kicked = true
      }
    }
  }

  updateChat(m.chat, 'warnings', chat.warnings)
  return { count: current.count, limit, kicked }
}

export async function removeWarning(m: any, targetJid: string, all = false) {
  const chat = getChat(m.chat)
  const key = jidNumber(targetJid)
  const current = chat.warnings[key] || { count: 0, entries: [] }

  if (all) {
    delete chat.warnings[key]
  } else {
    current.count = Math.max(0, current.count - 1)
    current.entries.pop()
    if (current.count === 0) delete chat.warnings[key]
    else chat.warnings[key] = current
  }

  updateChat(m.chat, 'warnings', chat.warnings)
  return chat.warnings[key]?.count || 0
}

export function warningList(chat: any, targetJid: string) {
  const key = jidNumber(targetJid)
  const state = chat.warnings?.[key] || { count: 0, entries: [] }
  return {
    count: state.count,
    limit: chat.moderation?.warnLimit || 3,
    entries: state.entries || [],
  }
}

export async function groupInfo(sock: any, m: any) {
  const meta = await getCachedGroupMeta(sock, m.chat)
  const chat = getChat(m.chat, meta?.subject || '')
  const admins = (meta?.participants || []).filter((p: any) => p.admin)
  return {
    meta,
    chat,
    admins,
    members: meta?.participants?.length || 0,
  }
}
