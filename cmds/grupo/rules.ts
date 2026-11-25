/*
 * Reglas del grupo.
 */
import { getChat, updateChat } from '../../core/system/database.ts'

export default {
  command: ['rules', 'reglas'],
  category: 'grupo',
  description: 'Muestra o edita las reglas del grupo.',
  usage: '[set <texto> | del]',
  groupOnly: true,
  example: ['#rules', '#rules set 1. Respeto\n2. Sin spam'],
  async run({ m, args, isAdmin }: any) {
    const chat = getChat(m.chat)
    const sub = String(args[0] || '').toLowerCase()

    if (sub === 'set') {
      if (!isAdmin) return m.reply('ꕥ Solo un administrador puede editar las reglas.')
      const text = args.slice(1).join(' ').trim()
      if (!text) return m.reply('(>_<) Escribe las reglas después de *set*.')
      updateChat(m.chat, 'rules', text)
      return m.reply('(＾▽＾) Reglas actualizadas.')
    }

    if (sub === 'del' || sub === 'delete') {
      if (!isAdmin) return m.reply('ꕥ Solo un administrador puede borrar las reglas.')
      updateChat(m.chat, 'rules', '')
      return m.reply('(＾▽＾) Reglas eliminadas.')
    }

    if (!chat.rules) {
      return m.reply('ꕤ Este grupo todavía no tiene reglas.\nUn administrador puede usar *rules set <texto>*.')
    }

    return m.reply(
      [
        `╭─〔 📋 REGLAS · ${chat.title || 'GRUPO'} 〕`,
        chat.rules,
        '╰────────────',
      ].join('\n')
    )
  },
}
