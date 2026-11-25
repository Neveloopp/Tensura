/*
 * Lista de administradores del grupo.
 */
import { getCachedGroupMeta, jidNumber, normalizeJid } from '../../core/utils.ts'

export default {
  command: ['admins', 'administradores'],
  category: 'grupo',
  description: 'Lista los administradores del grupo.',
  groupOnly: true,
  example: ['#admins'],
  async run({ sock, m }: any) {
    const meta = await getCachedGroupMeta(sock, m.chat)
    const admins = (meta?.participants || []).filter((item: any) => item.admin)
    if (!admins.length) return m.reply('ꕤ Este grupo no tiene administradores registrados.')

    const mentions = admins
      .map((item: any) => normalizeJid(item?.id || item?.jid || item?.phoneNumber || ''))
      .filter(Boolean)

    const lines = [`╭─〔 👑 ADMINISTRADORES · ${meta?.subject || 'GRUPO'} 〕`]
    for (const jid of mentions) {
      const participant = admins.find((item: any) => {
        const ids = [item?.id, item?.jid, item?.phoneNumber, item?.lid].filter(Boolean).map(normalizeJid)
        return ids.includes(jid)
      })
      const role = participant?.admin === 'superadmin' ? '👑' : '🛡️'
      lines.push(`│ ${role} @${jidNumber(jid)}`)
    }
    lines.push('╰────────────')

    return sock.sendMessage(m.chat, { text: lines.join('\n'), mentions }, { quoted: m.raw })
  },
}
