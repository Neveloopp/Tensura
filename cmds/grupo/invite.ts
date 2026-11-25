/*
 * Enlace de invitación del grupo.
 */
export default {
  command: ['invite', 'linkgrupo', 'invitar'],
  category: 'grupo',
  description: 'Muestra o restablece el enlace de invitación.',
  usage: '[reset]',
  groupOnly: true,
  isAdmin: true,
  botAdmin: true,
  example: ['#invite', '#invite reset'],
  async run({ sock, m, args }: any) {
    if (String(args[0] || '').toLowerCase() === 'reset') {
      const result = await sock.groupRevokeInvite(m.chat)
      const code = typeof result === 'string' ? result : result?.code
      return m.reply(`(＾▽＾) Nuevo enlace:\nhttps://chat.whatsapp.com/${code}`)
    }

    const result = await sock.groupInviteCode(m.chat)
    const code = typeof result === 'string' ? result : result?.code
    return m.reply(`(＾▽＾) Enlace del grupo:\nhttps://chat.whatsapp.com/${code}`)
  },
}
