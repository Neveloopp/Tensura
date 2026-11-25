/*
 * Bienvenida del grupo.
 */
import { DEFAULT_WELCOME, getChat, updateChat } from '../../core/system/database.ts'
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
  command: ['welcome', 'bienvenida'],
  category: 'grupo',
  description: 'Activa, desactiva o personaliza el mensaje de bienvenida.',
  usage: 'on | off | set <texto> | reset',
  groupOnly: true,
  example: ['#welcome on', '#welcome set Hola {mencion}, bienvenido a {grupo}'],
  async run({ m, args, isAdmin }: any) {
    const chat = getChat(m.chat)
    const sub = String(args[0] || '').toLowerCase()

    if (!sub || sub === 'status') {
      return m.reply(
        [
          '╭─〔 👋 BIENVENIDA 〕',
          `│ ➛ Estado: ${chat.welcome.enabled ? 'activada' : 'desactivada'}`,
          `│ ➛ Mensaje: ${chat.welcome.message}`,
          '│',
          '│ Variables: {nombre} {mencion} {grupo} {miembros}',
          '╰────────────',
        ].join('\n')
      )
    }

    if (!isAdmin) return m.reply('ꕥ Solo un administrador puede cambiar la bienvenida.')

    if (sub === 'on' || sub === 'off') {
      updateChat(m.chat, 'welcome', { ...chat.welcome, enabled: sub === 'on' })
      return m.reply(`(＾▽＾) Bienvenida ${sub === 'on' ? 'activada' : 'desactivada'}.`)
    }

    if (sub === 'set') {
      const text = args.slice(1).join(' ').trim()
      if (!text) return m.reply('(>_<) Escribe el mensaje después de *set*.')
      updateChat(m.chat, 'welcome', { ...chat.welcome, message: text })
      return m.reply(`(＾▽＾) Bienvenida actualizada.\n\n${preview(text, chat)}`)
    }

    if (sub === 'reset') {
      updateChat(m.chat, 'welcome', { ...chat.welcome, message: DEFAULT_WELCOME })
      return m.reply('(＾▽＾) Mensaje de bienvenida restaurado.')
    }

    return m.reply('ꕤ Usa: welcome on | off | set <texto> | reset')
  },
}
