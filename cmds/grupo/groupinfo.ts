/*
 * Información completa del grupo.
 */
import moment from 'moment-timezone'
import botConfig from '../../settings.ts'
import { groupInfo } from '../../core/group.ts'
import { jidNumber } from '../../core/utils.ts'

export default {
  command: ['groupinfo', 'infogrupo', 'gp'],
  category: 'grupo',
  description: 'Muestra la información del grupo.',
  groupOnly: true,
  example: ['#groupinfo'],
  async run({ sock, m, isAdmin }: any) {
    const { meta, members, admins } = await groupInfo(sock, m)
    if (!meta) return m.reply('(x_x) No pude obtener la información del grupo.')

    let invite = ''
    if (isAdmin) {
      try {
        const code = await sock.groupInviteCode(m.chat)
        invite = `https://chat.whatsapp.com/${code}`
      } catch {}
    }

    const created = meta.creation
      ? moment(Number(meta.creation) * 1000).tz(botConfig.timezone).format('DD/MM/YYYY HH:mm')
      : 'Desconocida'

    const lines = [
      `╭─〔 📊 ${meta.subject || 'GRUPO'} 〕`,
      `│ ➛ ID: ${m.chat}`,
      `│ ➛ Creado: ${created}`,
      `│ ➛ Dueño: ${meta.owner ? `@${jidNumber(meta.owner)}` : 'Desconocido'}`,
      `│ ➛ Miembros: ${members}`,
      `│ ➛ Administradores: ${admins.length}`,
      `│ ➛ Solo admins escriben: ${meta.announce ? 'Sí' : 'No'}`,
      `│ ➛ Solo admins editan: ${meta.restrict ? 'Sí' : 'No'}`,
    ]

    if (meta.desc) {
      lines.push('│', '│ 📝 Descripción:', String(meta.desc).slice(0, 500))
    }
    if (invite) lines.push('│', `│ 🔗 ${invite}`)
    lines.push('╰────────────')

    return sock.sendMessage(
      m.chat,
      { text: lines.join('\n'), mentions: meta.owner ? [meta.owner] : [] },
      { quoted: m.raw }
    )
  },
}
