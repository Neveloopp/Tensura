/*
 * Mencionar a todos los miembros.
 */
import { getCachedGroupMeta, normalizeJid } from '../../core/utils.ts'

export default {
  command: ['tag', 'todos', 'mention'],
  category: 'grupo',
  description: 'Menciona a todos los miembros del grupo.',
  usage: '[texto]',
  groupOnly: true,
  isAdmin: true,
  example: ['#tag Atención a todos'],
  async run({ sock, m, args }: any) {
    const meta = await getCachedGroupMeta(sock, m.chat)
    const mentions = (meta?.participants || [])
      .map((item: any) => normalizeJid(item?.id || item?.jid || item?.phoneNumber || ''))
      .filter(Boolean)

    if (!mentions.length) return m.reply('(x_x) No pude obtener los miembros del grupo.')

    const text = args.join(' ').trim() || '📢 Atención a todos los miembros.'
    return sock.sendMessage(
      m.chat,
      { text: `${text}\n\n${mentions.map(jid => `@${jid.split('@')[0]}`).join(' ')}`, mentions },
      { quoted: m.raw }
    )
  },
}
