/*
 * MediaFire: información y descarga del archivo.
 */
import path from 'path'
import { formatBytes, getBuffer, getText } from '../../core/downloader.ts'
import { sanitizeFilename } from '../../core/utils.ts'

function parseMediafire(html: string) {
  const filename =
    html.match(/<div class="filename">([^<]+)<\/div>/)?.[1]?.trim() ||
    html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/)?.[1]?.replace(/\s*-\s*Download\s*$/, '').trim() ||
    ''

  const size = html.match(/File size:\s*<span>([^<]+)<\/span>/)?.[1]?.trim() || ''
  const date = html.match(/Uploaded:\s*<span>([^<]+)<\/span>/)?.[1]?.trim() || ''

  let download =
    html.match(/id="downloadButton"\s+[^>]*href="(https?:\/\/[^"]+)"/)?.[1] ||
    html.match(/href="(https?:\/\/download[^"]+)"/)?.[1]?.replace(/&amp;/g, '&') ||
    html.match(/(https?:\/\/download\d+\.mediafire\.com\/[^"'\s]+)/)?.[1]?.replace(/&amp;/g, '&') ||
    ''

  if (download.startsWith('//')) download = `https:${download}`

  return { filename, size, date, download }
}

export default {
  command: ['mediafire', 'mf'],
  category: 'dow',
  description: 'Descarga archivos desde MediaFire.',
  usage: '<enlace>',
  example: ['#mediafire https://www.mediafire.com/file/.../file'],
  async run({ sock, m, args }: any) {
    const url = String(args[0] || '').trim()
    if (!url || !/^https?:\/\/(?:www\.)?mediafire\.com\//i.test(url)) {
      return m.reply('(>_<) Envíame un enlace válido de MediaFire.')
    }

    const status = await m.reply('(^_^) Consultando MediaFire...')

    try {
      const html = await getText(url, {
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        },
      })

      const data = parseMediafire(html)
      if (!data.download || data.download === 'Not found') {
        throw new Error('No encontré el enlace de descarga. Verifica que el archivo sea público.')
      }

      const buffer = await getBuffer(data.download)
      const rawName = data.filename || 'mediafire-file'
      const extension = path.extname(rawName) || path.extname(new URL(data.download).pathname) || ''
      const fileName = `${sanitizeFilename(rawName)}${extension && !rawName.toLowerCase().endsWith(extension.toLowerCase()) ? extension : ''}`

      await sock.sendMessage(m.chat, { delete: status.key }).catch(() => null)

      return m.send({
        document: buffer,
        mimetype: 'application/octet-stream',
        fileName,
        caption: [
          '(＾▽＾) *MediaFire*',
          '',
          `• Nombre: ${data.filename || fileName}`,
          `• Tamaño: ${data.size || formatBytes(buffer.length)}`,
          `• Fecha: ${data.date || 'Desconocida'}`,
        ].join('\n'),
      })
    } catch (error: any) {
      await sock.sendMessage(m.chat, { delete: status.key }).catch(() => null)
      return m.reply(`(x_x) ${error?.message || 'No pude descargar el archivo.'}`)
    }
  },
}
