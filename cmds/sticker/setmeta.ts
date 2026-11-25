/*
 * Metadatos de los stickers del usuario.
 */
import botConfig from '../../settings.ts'
import { getStickerMeta, updateStickerMeta } from '../../core/system/database.ts'

export default {
  command: ['setmeta', 'setsticker', 'pack', 'delmeta'],
  category: 'sticker',
  description: 'Cambia el nombre y autor de tus stickers.',
  usage: '<pack> | <autor>',
  example: ['#setmeta Mi Pack | Mi Nombre', '#delmeta'],
  async run({ m, args, command }: any) {
    const current = getStickerMeta(m.sender)

    if (command === 'delmeta') {
      updateStickerMeta(m.sender, 'pack', botConfig.sticker.pack)
      updateStickerMeta(m.sender, 'author', botConfig.sticker.author)
      updateStickerMeta(m.sender, 'emojis', botConfig.sticker.emojis)
      return m.reply('(＾▽＾) Metadatos restaurados a los valores por defecto.')
    }

    if (!args.length) {
      return m.reply(
        [
          '╭─〔 🏷️ METADATOS 〕',
          `│ ➛ Pack: ${current.pack}`,
          `│ ➛ Autor: ${current.author}`,
          '│',
          '│ Usa: setmeta <pack> | <autor>',
          '╰────────────',
        ].join('\n')
      )
    }

    const [pack, ...rest] = args.join(' ').split('|')
    const author = rest.join('|').trim()

    if (!pack?.trim()) return m.reply('(>_<) Escribe el nombre del pack.')

    updateStickerMeta(m.sender, 'pack', pack.trim())
    if (author) updateStickerMeta(m.sender, 'author', author)

    return m.reply(
      `(＾▽＾) Metadatos actualizados.\n• Pack: ${pack.trim()}\n• Autor: ${author || current.author}`
    )
  },
}
