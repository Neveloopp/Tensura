/*
 * Expulsar miembros.
 */
import { getTarget, botJid } from '../../core/group.ts'
import { isJidAdminInGroup, jidNumber } from '../../core/utils.ts'

export default {
  command: ['kick', 'expulsar', 'ban'],
  category: 'grupo',
  description: 'Expulsa a un miembro del grupo.',
  usage: '<mención | respuesta | número>',
  groupOnly: true,
  isAdmin: true,
  botAdmin: true,
  example: ['#kick @usuario', '#kick (respondiendo a un mensaje)'],
  async run({ sock, m, args, isOwner }: any) {
    const target = await getTarget(sock, m, args)
    if (!target?.jid) {
      return m.reply('(>_<) Menciona, responde o escribe el número del miembro a expulsar.')
    }
    if (target.jid === botJid(sock)) return m.reply('(x_x) No puedo expulsarme a mí mismo.')
    if (target.jid === m.sender) return m.reply('(x_x) No puedes expulsarte a ti mismo.')

    const targetIsAdmin = await isJidAdminInGroup(sock, m.chat, target.jid).catch(() => false)
    if (targetIsAdmin && !isOwner) {
      return m.reply('(x_x) No puedo expulsar a un administrador del grupo.')
    }

    await sock.groupParticipantsUpdate(m.chat, [target.jid], 'remove')
    return m.reply(`(＾▽＾) @${jidNumber(target.jid)} fue expulsado del grupo.`)
  },
}
