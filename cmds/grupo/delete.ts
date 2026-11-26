/*
 * Borrar el mensaje citado.
 */
import { isBotIdentity } from '../../core/group.ts'
import { isBotAdminInGroup } from '../../core/utils.ts'

export default {
  command: ['delete', 'del', 'borrar'],
  category: 'grupo',
  description: 'Borra el mensaje al que respondes.',
  usage: '(respondiendo a un mensaje)',
  groupOnly: true,
  example: ['#del (respondiendo a un mensaje)'],
  async run({ sock, m, isAdmin }: any) {
    if (!m.quoted?.key) {
      return m.reply('(>_<) Responde al mensaje que quieres borrar.')
    }

    const sender = m.quoted.sender
    const ownMessage = isBotIdentity(sock, sender) || sender === m.sender

    if (!ownMessage) {
      if (!isAdmin) return m.reply('ꕥ Solo un administrador puede borrar mensajes de otros.')
      const botIsAdmin = await isBotAdminInGroup(sock, m.chat).catch(() => false)
      if (!botIsAdmin) return m.reply('ꕥ Necesito ser administrador para borrar ese mensaje.')
    }

    await sock.sendMessage(m.chat, { delete: m.quoted.key })
    return m.react('🗑️').catch(() => null)
  },
}
