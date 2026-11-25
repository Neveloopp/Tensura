/*
 * TikTok: video o audio.
 */
import fs from 'fs'
import { evogb, formatBytes, getBuffer } from '../../core/downloader.ts'
import { extractAudioMp3 } from '../../core/exif.ts'
import { extractUrl, removeFile, sanitizeFilename, tempFile } from '../../core/utils.ts'

function formatNumber(value: any) {
  const number = Number(value || 0)
  return number ? number.toLocaleString('es-ES') : '0'
}

export default {
  command: ['tiktok', 'tt', 'tiktokaudio', 'tta'],
  category: 'dow',
  description: 'Descarga videos o audio de TikTok.',
  usage: '<enlace>',
  example: ['#tiktok https://vm.tiktok.com/...', '#tta https://vm.tiktok.com/...'],
  async run({ sock, m, args, command, text }: any) {
    const url = extractUrl([text, ...args].join(' ')) || String(args[0] || '')
    if (!url || !/tiktok\.com|vm\.tiktok/i.test(url)) {
      return m.reply('(>_<) Envíame un enlace válido de TikTok.')
    }

    const audioOnly =
      ['tiktokaudio', 'tta'].includes(command) || /(?:^|\s)(-aud|audio)(?:\s|$)/i.test(text)

    const status = await m.reply('(^_^) Obteniendo datos de TikTok...')

    try {
      const json = await evogb(audioOnly ? '/dl/tiktokmp3' : '/dl/tiktok', { url })
      if (!json?.status || !json?.data) {
        throw new Error(json?.message || 'No pude obtener información del video.')
      }

      const data = json.data
      const link = data.dl || data.download || data.url || data.audio
      if (!link) throw new Error('La API no devolvió un enlace de descarga.')

      let buffer: Buffer

      if (audioOnly) {
        try {
          buffer = await getBuffer(link)
        } catch {
          const videoJson = await evogb('/dl/tiktok', { url })
          const videoLink =
            videoJson?.data?.dl || videoJson?.data?.download || videoJson?.data?.url
          if (!videoLink) throw new Error('La API no devolvió el video para extraer el audio.')

          const videoBuffer = await getBuffer(videoLink)
          const input = tempFile('tiktok-audio-input', '.mp4')
          const output = tempFile('tiktok-audio-output', '.mp3')
          fs.writeFileSync(input, videoBuffer)

          try {
            const extracted = await extractAudioMp3(input, output)
            buffer = extracted.buffer
          } finally {
            removeFile(input)
            removeFile(output)
          }
        }
      } else {
        buffer = await getBuffer(link)
      }

      await sock.sendMessage(m.chat, { delete: status.key }).catch(() => null)

      const title = data.title || 'TikTok'
      const author = data.author?.nickname || data.author?.name || 'Desconocido'
      const username = data.author?.unique_id ? `@${data.author.unique_id}` : ''
      const stats = data.stats || {}

      const caption = [
        `(＾▽＾) *${String(title).slice(0, 150)}*`,
        '',
        `• Autor: ${author} ${username}`.trim(),
        `• Vistas: ${formatNumber(stats.plays)}`,
        `• Likes: ${formatNumber(stats.likes)}`,
        `• Comentarios: ${formatNumber(stats.comments)}`,
        `• Compartidos: ${formatNumber(stats.shares)}`,
        `• Tamaño: ${formatBytes(buffer.length)}`,
      ].join('\n')

      if (audioOnly) {
        await m.reply(caption)
        return m.send({
          audio: buffer,
          mimetype: /\.m4a(\?|$)/i.test(link) ? 'audio/mp4' : 'audio/mpeg',
          fileName: `${sanitizeFilename(title)}.mp3`,
          ptt: false,
        })
      }

      return m.send({
        video: buffer,
        mimetype: 'video/mp4',
        fileName: `${sanitizeFilename(title)}.mp4`,
        caption,
      })
    } catch (error: any) {
      await sock.sendMessage(m.chat, { delete: status.key }).catch(() => null)
      return m.reply(`(x_x) ${error?.message || 'No pude descargar el video.'}`)
    }
  },
}
