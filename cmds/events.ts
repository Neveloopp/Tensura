/*
 * Eventos de grupo: bienvenidas y despedidas.
 */
import { getChat } from '../core/system/database.ts'
import { jidNumber, normalizeJid, renderTemplate } from '../core/utils.ts'

async function memberName(sock: any, groupJid: string, jid: string, meta: any) {
  const target = normalizeJid(jid)
  const digits = jidNumber(target)
  const participant = (meta?.participants || []).find((item: any) => {
    const ids = [item?.id, item?.jid, item?.phoneNumber, item?.lid]
      .filter(Boolean)
      .map((value: any) => normalizeJid(value))
    return ids.includes(target) || ids.some((id: string) => jidNumber(id) === digits)
  })
  return participant?.notify || participant?.name || digits || 'Usuario'
}

export default async function groupEvents(sock: any, update: any) {
  const groupJid = String(update?.id || '')
  if (!groupJid.endsWith('@g.us')) return

  const action = String(update?.action || '')
  if (!['add', 'remove'].includes(action)) return

  const chat = getChat(groupJid)
  const enabled = action === 'add' ? chat.welcome?.enabled : chat.farewell?.enabled
  if (!enabled) return

  const meta = await sock.groupMetadata(groupJid).catch(() => null)
  const participants = Array.isArray(update?.participants) ? update.participants : []

  for (const raw of participants) {
    const jid = normalizeJid(typeof raw === 'string' ? raw : raw?.id || raw?.jid || '')
    if (!jid) continue

    const name = await memberName(sock, groupJid, jid, meta)
    const values = {
      nombre: name,
      mencion: `@${jidNumber(jid)}`,
      usuario: `@${jidNumber(jid)}`,
      id: jidNumber(jid),
      grupo: meta?.subject || chat.title || 'el grupo',
      miembros: String(meta?.participants?.length || 0),
    }

    const template = action === 'add' ? chat.welcome.message : chat.farewell.message
    const text = renderTemplate(template, values)

    await sock
      .sendMessage(groupJid, { text, mentions: [jid] })
      .catch(() => null)
  }
}
