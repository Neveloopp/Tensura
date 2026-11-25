/*
 * Facebook: descarga el mejor formato disponible.
 */
import { evogb, formatBytes, getBuffer } from '../../core/downloader.ts'
import { extractUrl, sanitizeFilename } from '../../core/utils.ts'

export default {
  command: ['facebook', 'fb', 'face'],
  category: 'dow',
  description: 'Descarga videos de Facebook.',
  usage: '<enlace>',
  example: ['#fb https://www.facebook.com/share/r/...'],
  async run({ sock, m, args, text }: any) {
    const url = extractUrl([text, ...args].join(' ')) || String(args[0] || '')
    if (!url || !/facebook\.com|fb\.watch/i.test(url)) {
      return m.reply('(>_<) Envíame un enlace válido de Facebook.')
    }

    const status = await m.reply('(^_^) Procesando enlace de Facebook...')

    try {
      const json = await evogb('/dl/facebook', { url })
      const list = Array.isArray(json?.resultados)
        ? json.resultados
        : Array.isArray(json?.result)
          ? json.result
          : []

      if (!json?.status || !list.length) {
        throw new Error(json?.message || 'No pude obtener formatos para ese enlace.')
      }

      const valid = list.filter((item: any) => /^https?:\/\//i.test(String(item?.url || '').trim()))
      if (!valid.length) throw new Error('La API no devolvió URLs descargables.')

      const selected =
        valid.find((item: any) => /1080|720|hd/i.test(String(item?.quality || ''))) || valid[0]

      const buffer = await getBuffer(selected.url)
      await sock.sendMessage(m.chat, { delete: status.key }).catch(() => null)

      return m.send({
        video: buffer,
        mimetype: 'video/mp4',
        fileName: `facebook-${Date.now()}.mp4`,
        caption: [
          '(＾▽＾) *Facebook Downloader*',
          '',
          `• Calidad: ${selected.quality || 'Auto'}`,
          `• Tamaño: ${formatBytes(buffer.length)}`,
        ].join('\n'),
      })
    } catch (error: any) {
      await sock.sendMessage(m.chat, { delete: status.key }).catch(() => null)
      return m.reply(`(x_x) ${error?.message || 'No pude descargar el video.'}`)
    }
  },
}
