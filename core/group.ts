/*
 * Helpers exclusivos de grupos: objetivos, permisos,
 * advertencias y plantillas de bienvenida.
 */
import { getChat, updateChat } from './system/database.ts'
import {
  getCachedGroupMeta,
  isJidAdminInGroup,
  jidNumber,
  normalizeJid,
  renderTemplate,
  resolveLidToRealJid,
} from './utils.ts'

export function botJid(sock: any): string {
  return normalizeJid(sock?.user?.id || '')
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
  const admin = await isJidAdminInGroup(sock, m.chat, botJid(sock))
  if (!admin) throw new Error('Necesito ser administrador del grupo para hacer eso.')
  return true
}

export async function getTarget(sock: any, m: any, args: string[] = []) {
  if (m?.quoted?.sender) {
    return {
      jid: await resolveLidToRealJid(m.quoted.sender, sock, m.chat),
      consumed: 0,
      quoted: true,
    }
  }

  const mentioned = m?.mentionedJid?.[0]
  if (mentioned) {
    return {
      jid: await resolveLidToRealJid(mentioned, sock, m.chat),
      consumed: args.findIndex(arg => String(arg).includes(jidNumber(mentioned))) + 1 || 1,
      quoted: false,
    }
  }

  const index = args.findIndex(arg => /^\+?\d{8,16}$/.test(String(arg).replace(/[\s-]/g, '')))
  if (index >= 0) {
    const digits = String(args[index]).replace(/\D/g, '')
    if (digits) {
      return {
        jid: `${digits}@s.whatsapp.net`,
        consumed: index + 1,
        quoted: false,
      }
    }
  }

  return null
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
    const botIsAdmin = await isJidAdminInGroup(sock, m.chat, botJid(sock)).catch(() => false)
    if (botIsAdmin) {
      try {
        await sock.groupParticipantsUpdate(m.chat, [targetJid], 'remove')
        delete chat.warnings[key]
        kicked = true
      } catch {}
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
