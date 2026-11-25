/*
 * Convertir sticker a imagen.
 */
import { webpToPng } from '../../core/exif.ts'

export default {
  command: ['toimg', 'toimage', 'img'],
  category: 'sticker',
  description: 'Convierte un sticker en imagen PNG.',
  example: ['#toimg (respondiendo a un sticker)'],
  async run({ m }: any) {
    if (!m.quoted?.isSticker) {
      return m.reply('(>_<) Responde a un sticker para convertirlo en imagen.')
    }

    try {
      const buffer = await m.quoted.download()
      const png = await webpToPng(buffer)
      return m.send({ image: png, caption: '(＾▽＾) Sticker convertido a PNG.' })
    } catch (error: any) {
      return m.reply(`(x_x) No pude convertir el sticker: ${error?.message || 'error desconocido'}`)
    }
  },
}
