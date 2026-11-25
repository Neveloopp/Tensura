/*
 * Despedida del grupo.
 */
import { DEFAULT_FAREWELL, getChat, updateChat } from '../../core/system/database.ts'
import { renderTemplate } from '../../core/utils.ts'

function preview(template: string, chat: any) {
  return renderTemplate(template, {
    nombre: 'Usuario',
    mencion: '@1234567890',
    usuario: '@1234567890',
    id: '1234567890',
    grupo: chat.title || 'el grupo',
    miembros: '0',
  })
}

export default {
  command: ['goodbye', 'despedida'],
  category: 'grupo',
  description: 'Activa, desactiva o personaliza el mensaje de despedida.',
  usage: 'on | off | set <texto> | reset',
  groupOnly: true,
  example: ['#goodbye on', '#goodbye set Hasta luego, {nombre}'],
  async run({ m, args, isAdmin }: any) {
    const chat = getChat(m.chat)
    const sub = String(args[0] || '').toLowerCase()

    if (!sub || sub === 'status') {
      return m.reply(
        [
          '╭─〔 👋 DESPEDIDA 〕',
          `│ ➛ Estado: ${chat.farewell.enabled ? 'activada' : 'desactivada'}`,
          `│ ➛ Mensaje: ${chat.farewell.message}`,
          '│',
          '│ Variables: {nombre} {mencion} {grupo} {miembros}',
          '╰────────────',
        ].join('\n')
      )
    }

    if (!isAdmin) return m.reply('ꕥ Solo un administrador puede cambiar la despedida.')

    if (sub === 'on' || sub === 'off') {
      updateChat(m.chat, 'farewell', { ...chat.farewell, enabled: sub === 'on' })
      return m.reply(`(＾▽＾) Despedida ${sub === 'on' ? 'activada' : 'desactivada'}.`)
    }

    if (sub === 'set') {
      const text = args.slice(1).join(' ').trim()
      if (!text) return m.reply('(>_<) Escribe el mensaje después de *set*.')
      updateChat(m.chat, 'farewell', { ...chat.farewell, message: text })
      return m.reply(`(＾▽＾) Despedida actualizada.\n\n${preview(text, chat)}`)
    }

    if (sub === 'reset') {
      updateChat(m.chat, 'farewell', { ...chat.farewell, message: DEFAULT_FAREWELL })
      return m.reply('(＾▽＾) Mensaje de despedida restaurado.')
    }

    return m.reply('ꕤ Usa: goodbye on | off | set <texto> | reset')
  },
}
