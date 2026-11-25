/*
 * Antienlaces: elimina enlaces y advierte al autor.
 */
import { getChat, updateChat } from '../../core/system/database.ts'

export default {
  command: ['antilink', 'antienlaces'],
  category: 'grupo',
  description: 'Activa o desactiva el bloqueo de enlaces.',
  usage: 'on | off | status',
  groupOnly: true,
  isAdmin: true,
  example: ['#antilink on', '#antilink off'],
  async run({ m, args }: any) {
    const chat = getChat(m.chat)
    const sub = String(args[0] || '').toLowerCase()

    if (!sub || sub === 'status') {
      return m.reply(
        [
          '╭─〔 🔗 ANTIENLACES 〕',
          `│ ➛ Estado: ${chat.moderation.antiLinks ? 'activado' : 'desactivado'}`,
          `│ ➛ Límite de advertencias: ${chat.moderation.warnLimit}`,
          '╰────────────',
        ].join('\n')
      )
    }

    if (!['on', 'off'].includes(sub)) {
      return m.reply('ꕤ Usa: antilink on | off | status')
    }

    updateChat(m.chat, 'moderation', {
      ...chat.moderation,
      antiLinks: sub === 'on',
    })

    return m.reply(`(＾▽＾) Antienlaces ${sub === 'on' ? 'activado' : 'desactivado'}.`)
  },
}
