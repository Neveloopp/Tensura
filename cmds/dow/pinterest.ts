/*
 * Pinterest: descarga un pin o busca imágenes.
 */
import { evogb, formatBytes, getBuffer } from '../../core/downloader.ts'
import { extractUrl, sanitizeFilename } from '../../core/utils.ts'

function isPinterestUrl(value: string) {
  return /^https?:\/\/(?:www\.)?(?:pinterest\.[a-z.]+|pin\.it)\//i.test(value)
}

export default {
  command: ['pinterest', 'pin'],
  category: 'dow',
  description: 'Descarga un pin o busca imágenes en Pinterest.',
  usage: '<enlace | búsqueda>',
  example: ['#pinterest https://pin.it/...', '#pinterest gatos aesthetic'],
  async run({ sock, m, args, text }: any) {
    const input = args.join(' ').trim()
    if (!input) return m.reply('(>_<) Envíame un enlace o una búsqueda de Pinterest.')

    const url = extractUrl(input)

    if (url && isPinterestUrl(url)) {
      const status = await m.reply('(^_^) Descargando pin...')
      try {
        const json = await evogb('/dl/pinterest', { url })
        const data = json?.data
        if (!json?.status || !data?.dl) throw new Error('No pude obtener el contenido del pin.')

        const buffer = await getBuffer(data.dl)
        await sock.sendMessage(m.chat, { delete: status.key }).catch(() => null)

        const isVideo = String(data.type || '').toLowerCase() === 'video'
        const caption = [
          `(＾▽＾) *${data.title || 'Pinterest'}*`,
          '',
          `• Autor: ${data.author || 'Desconocido'}`,
          data.username ? `• Usuario: @${data.username}` : '',
          `• Tamaño: ${formatBytes(buffer.length)}`,
        ]
          .filter(Boolean)
          .join('\n')

        if (isVideo) {
          return m.send({
            video: buffer,
            mimetype: 'video/mp4',
            fileName: `${sanitizeFilename(data.title || 'pinterest')}.mp4`,
            caption,
          })
        }

        return m.send({ image: buffer, caption })
      } catch (error: any) {
        await sock.sendMessage(m.chat, { delete: status.key }).catch(() => null)
        return m.reply(`(x_x) ${error?.message || 'No pude descargar el pin.'}`)
      }
    }

    const query = input
    const status = await m.reply(`(^_^) Buscando *${query}* en Pinterest...`)

    try {
      const json = await evogb('/search/pinterest', { query })
      const list = Array.isArray(json?.data)
        ? json.data.filter((item: any) => item && (item.hd || item.mini))
        : []

      if (!json?.status || !list.length) throw new Error('No encontré imágenes para esa búsqueda.')

      await sock.sendMessage(m.chat, { delete: status.key }).catch(() => null)

      const selected = list.slice(0, 5)
      for (let index = 0; index < selected.length; index++) {
        const item = selected[index]
        const imageUrl = item.hd || item.mini
        const buffer = await getBuffer(imageUrl)
        await m.send({
          image: buffer,
          caption:
            index === 0
              ? `(＾▽＾) *Pinterest*\n\n• Búsqueda: ${query}\n• Mostrando: ${selected.length}`
              : '',
        })
      }

      return
    } catch (error: any) {
      await sock.sendMessage(m.chat, { delete: status.key }).catch(() => null)
      return m.reply(`(x_x) ${error?.message || 'No pude buscar en Pinterest.'}`)
    }
  },
}
