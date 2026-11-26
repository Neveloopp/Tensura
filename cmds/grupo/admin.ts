/*
 * Dar o quitar administración.
 */
import { getTarget, updateGroupParticipant } from '../../core/group.ts'
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

    const result = await updateGroupParticipant(sock, m.chat, target, action)
    if (!result.ok) {
      return m.reply(
        `(x_x) No pude cambiar el rango de @${jidNumber(target.jid)}.\n${result.error}` +
          '\nVerifica que siga siendo administrador y que el miembro esté en el grupo.'
      )
    }

    return m.reply(`${emoji} @${jidNumber(target.jid)} ahora es ${label}.`)
  },
}
