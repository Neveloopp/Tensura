/*
 * Instagram: publicaciones y carruseles.
 */
import { formatBytes, getBuffer, raylais } from '../../core/downloader.ts'
import { extractUrl, sanitizeFilename } from '../../core/utils.ts'

function normalizeMedia(json: any) {
  const items: { type: 'video' | 'photo'; url: string }[] = []
  const add = (type: any, url: any) => {
    const value = String(url || '').trim()
    if (!/^https?:\/\//i.test(value) || items.some(item => item.url === value)) return
    const isVideo =
      String(type || '').toLowerCase().includes('video') || /\.mp4(?:\?|$)/i.test(value)
    items.push({ type: isVideo ? 'video' : 'photo', url: value })
  }

  for (const item of json?.media || []) add(item?.type, item?.url || item?.mediaUrl || item?.src)
  for (const item of json?.carouselItems || []) {
    add(
      item?.type || (item?.video ? 'video' : 'photo'),
      item?.url || item?.video || item?.image || item?.src
    )
  }
  for (const url of json?.mediaUrls || []) add(json?.type, url)
  for (const url of json?.datos?.videos || []) add('video', url)
  for (const url of json?.datos?.imagenes || []) add('photo', url)
  if (!items.length) add(json?.type || json?.tipo, json?.video || json?.image || json?.url)

  return items
}

export default {
  command: ['instagram', 'ig', 'insta'],
  category: 'dow',
  description: 'Descarga fotos y videos de Instagram.',
  usage: '<enlace>',
  example: ['#ig https://www.instagram.com/reel/...'],
  async run({ sock, m, args, text }: any) {
    const url = extractUrl([text, ...args].join(' ')) || String(args[0] || '')
    if (!url || !/instagram\.com/i.test(url)) {
      return m.reply('(>_<) Envíame un enlace válido de Instagram.')
    }

    const status = await m.reply('(^_^) Procesando enlace de Instagram...')

    try {
      const json = await raylais('/api/instagram', { url })
      if (!(json?.success || json?.status)) {
        throw new Error(json?.message || json?.error || 'No pude procesar el enlace.')
      }

      const media = normalizeMedia(json)
      if (!media.length) throw new Error('La API no devolvió archivos descargables.')

      await sock.sendMessage(m.chat, { delete: status.key }).catch(() => null)

      const selected = media.slice(0, 10)
      for (let index = 0; index < selected.length; index++) {
        const item = selected[index]
        const buffer = await getBuffer(item.url)
        const caption =
          index === 0
            ? [
                '(＾▽＾) *Instagram*',
                '',
                `• Archivos: ${selected.length}`,
                `• Solicitado por: ${m.pushName || 'usuario'}`,
              ].join('\n')
            : ''

        if (item.type === 'video') {
          await m.send({
            video: buffer,
            mimetype: 'video/mp4',
            fileName: `instagram-${index + 1}.mp4`,
            caption,
          })
        } else {
          await m.send({ image: buffer, caption })
        }
      }

      return
    } catch (error: any) {
      await sock.sendMessage(m.chat, { delete: status.key }).catch(() => null)
      return m.reply(`(x_x) ${error?.message || 'No pude descargar el contenido.'}`)
    }
  },
}
