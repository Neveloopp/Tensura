/*
 * Cerrar y abrir el grupo.
 */
import { getChat, updateChat } from '../../core/system/database.ts'

export default {
  command: ['close', 'cerrar', 'open', 'abrir'],
  category: 'grupo',
  description: 'Cierra o abre el grupo para que solo los administradores escriban.',
  usage: '',
  groupOnly: true,
  isAdmin: true,
  botAdmin: true,
  example: ['#close', '#open'],
  async run({ sock, m, command }: any) {
    const closing = ['close', 'cerrar'].includes(command)
    const setting = closing ? 'announcement' : 'not_announcement'
    await sock.groupSettingUpdate(m.chat, setting)

    const chat = getChat(m.chat)
    updateChat(m.chat, 'schedule', {
      ...chat.schedule,
      state: closing ? 'closed' : 'open',
    })

    return m.reply(closing ? '🔒 Grupo cerrado.' : '🔓 Grupo abierto.')
  },
}
