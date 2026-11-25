/*
 * APK: busca y descarga aplicaciones Android.
 */
import { evogb, formatBytes, getBuffer } from '../../core/downloader.ts'
import { sanitizeFilename } from '../../core/utils.ts'

export default {
  command: ['apk', 'apkdl'],
  category: 'dow',
  description: 'Busca y descarga una APK de Android.',
  usage: '<nombre de la app>',
  example: ['#apk WhatsApp', '#apk com.whatsapp'],
  async run({ sock, m, args }: any) {
    const query = args.join(' ').trim()
    if (!query) return m.reply('(>_<) Escribe el nombre de la aplicación.')

    const status = await m.reply(`(^_^) Buscando *${query}*...`)

    try {
      const json = await evogb('/search/apk', { query })
      const data = json?.data
      if (!json?.status || json.code !== 200 || !data?.dl) {
        throw new Error('No encontré ninguna aplicación con ese nombre.')
      }

      const buffer = await getBuffer(data.dl)
      await sock.sendMessage(m.chat, { delete: status.key }).catch(() => null)

      const base = sanitizeFilename(data.name || query)
      const fileName = base.toLowerCase().endsWith('.apk') ? base : `${base}.apk`

      return m.send({
        document: buffer,
        mimetype: 'application/vnd.android.package-archive',
        fileName,
        caption: [
          `(＾▽＾) *${data.name || query}*`,
          '',
          `• Paquete: ${data.package || 'Desconocido'}`,
          `• Tamaño: ${data.size || formatBytes(buffer.length)}`,
          `• Actualizado: ${data.lastUpdated || 'Desconocido'}`,
        ].join('\n'),
      })
    } catch (error: any) {
      await sock.sendMessage(m.chat, { delete: status.key }).catch(() => null)
      return m.reply(`(x_x) ${error?.message || 'No pude descargar la APK.'}`)
    }
  },
}
