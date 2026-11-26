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
    const reset = String(args[0] || '').toLowerCase() === 'reset'

    try {
      const result = reset ? await sock.groupRevokeInvite(m.chat) : await sock.groupInviteCode(m.chat)
      const code = typeof result === 'string' ? result : result?.code
      if (!code) throw new Error('WhatsApp no devolvió el enlace.')

      return m.reply(
        reset
          ? `(＾▽＾) Nuevo enlace:\nhttps://chat.whatsapp.com/${code}`
          : `(＾▽＾) Enlace del grupo:\nhttps://chat.whatsapp.com/${code}`
      )
    } catch (error: any) {
      return m.reply(
        `(x_x) No pude ${reset ? 'restablecer' : 'obtener'} el enlace del grupo.\n` +
          `${error?.message || 'WhatsApp rechazó la solicitud.'}\n` +
          'Verifica que siga siendo administrador y que el grupo permita el enlace.'
      )
    }
  },
}
