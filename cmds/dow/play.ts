/*
 * YouTube: audio con play y video con play2.
 */
import {
  formatBytes,
  getBuffer,
  resolveYouTube,
  youtubeDownload,
} from '../../core/downloader.ts'
import { sanitizeFilename } from '../../core/utils.ts'

const MODES = ['fast', 'medium', 'best']

export default {
  command: ['play', 'play2', 'playaudio', 'playvideo', 'yt'],
  category: 'dow',
  description: 'Busca en YouTube y descarga audio o video.',
  usage: '<búsqueda | enlace> [fast|medium|best]',
  example: ['#play Bad Bunny', '#play2 https://youtu.be/... best'],
  async run({ sock, m, args, command, prefix }: any) {
    const mode = args.find((arg: string) => MODES.includes(String(arg).toLowerCase())) || 'medium'
    const input = args
      .filter((arg: string) => !MODES.includes(String(arg).toLowerCase()))
      .join(' ')
      .trim()

    if (!input) {
      return m.reply(
        `(>_<) Escribe qué quieres descargar.\nEjemplo: ${prefix || '#'}play Bad Bunny`
      )
    }

    const isVideo = ['play2', 'playvideo', 'yt'].includes(command)
    const status = await m.reply('(^_^) Buscando en YouTube...')

    try {
      const video = await resolveYouTube(input)
      const download = await youtubeDownload(video.url, isVideo ? 'video' : 'audio', mode)
      const buffer = await getBuffer(download.url)

      await sock.sendMessage(m.chat, { delete: status.key }).catch(() => null)

      const caption = [
        `(＾▽＾) *${video.title}*`,
        '',
        `• Autor: ${video.author || 'Desconocido'}`,
        `• Duración: ${video.duration || '—'}`,
        `• Modo: ${mode}`,
        `• Tamaño: ${formatBytes(buffer.length)}`,
        `• Enlace: ${video.url}`,
      ].join('\n')

      if (isVideo) {
        return m.send({
          video: buffer,
          mimetype: 'video/mp4',
          fileName: `${sanitizeFilename(video.title)}.mp4`,
          caption,
        })
      }

      await m.reply(caption)
      return m.send({
        audio: buffer,
        mimetype: 'audio/mpeg',
        fileName: `${sanitizeFilename(video.title)}.mp3`,
        ptt: false,
      })
    } catch (error: any) {
      await sock.sendMessage(m.chat, { delete: status.key }).catch(() => null)
      return m.reply(`(x_x) ${error?.message || 'No pude completar la descarga.'}`)
    }
  },
}
