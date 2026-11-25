/*
 * Dar o quitar administración.
 */
import { getTarget } from '../../core/group.ts'
import { jidNumber } from '../../core/utils.ts'

export default {
  command: ['promote', 'demote', 'daradmin', 'quitaradmin'],
  category: 'grupo',
  description: 'Da o quita el rango de administrador a un miembro.',
  usage: '<mención | respuesta | número>',
  groupOnly: true,
  isAdmin: true,
  botAdmin: true,
  example: ['#promote @usuario', '#demote @usuario'],
  async run({ sock, m, args, command }: any) {
    const target = await getTarget(sock, m, args)
    if (!target?.jid) {
      return m.reply('(>_<) Menciona, responde o escribe el número del miembro.')
    }

    const action = ['promote', 'daradmin'].includes(command) ? 'promote' : 'demote'
    const label = action === 'promote' ? 'administrador' : 'miembro'
    const emoji = action === 'promote' ? '👑' : '👤'

    await sock.groupParticipantsUpdate(m.chat, [target.jid], action)
    return m.reply(`${emoji} @${jidNumber(target.jid)} ahora es ${label}.`)
  },
}
