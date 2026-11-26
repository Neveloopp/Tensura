/*
 * Expulsar miembros.
 */
import { getTarget, isBotIdentity, removeGroupParticipant } from '../../core/group.ts'
import { isJidAdminInGroup, jidNumber, jidsMatch, normalizeJid } from '../../core/utils.ts'

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

    const targetIds = [...new Set([target.jid, ...(target.jids || [])].map(normalizeJid).filter(Boolean))]
    if (targetIds.some(jid => isBotIdentity(sock, jid))) {
      return m.reply('(x_x) No puedo expulsarme a mí mismo.')
    }
    if (targetIds.some(jid => jidsMatch(jid, m.sender))) {
      return m.reply('(x_x) No puedes expulsarte a ti mismo.')
    }

    let targetIsAdmin = false
    for (const jid of targetIds) {
      targetIsAdmin = await isJidAdminInGroup(sock, m.chat, jid).catch(() => false)
      if (targetIsAdmin) break
    }
    if (targetIsAdmin && !isOwner) {
      return m.reply('(x_x) No puedo expulsar a un administrador del grupo.')
    }

    const result = await removeGroupParticipant(sock, m.chat, target)
    if (!result.ok) {
      return m.reply(
        `(x_x) No pude expulsar a @${jidNumber(target.jid)}.\n${result.error}` +
          '\nVerifica que siga siendo administrador y que el miembro esté en el grupo.'
      )
    }

    return m.reply(`(＾▽＾) @${jidNumber(target.jid)} fue expulsado del grupo.`)
  },
}
