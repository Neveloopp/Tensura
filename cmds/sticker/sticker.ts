/*
 * Sticker normal y sticker con audio (-aud).
 */
import fs from 'fs'
import botConfig from '../../settings.ts'
import { createStickerBuffer, probeDuration } from '../../core/exif.ts'
import { sendAudioSticker } from '../../core/audioSticker.ts'
import { getStickerMeta } from '../../core/system/database.ts'
import { extensionFromMime, removeFile, tempFile } from '../../core/utils.ts'

export default {
  command: ['sticker', 's', 'stiker'],
  category: 'sticker',
  description: 'Convierte imágenes o videos en stickers. Usa -aud para incluir el audio del video.',
  usage: '[-aud]',
  example: ['#s (respondiendo a una imagen/video)', '#s -aud (respondiendo a un video)'],
  async run({ sock, m, args, text }: any) {
    const quoted = m.quoted
    const direct = ['imageMessage', 'videoMessage', 'documentMessage'].includes(m.mtype) ? m : null
    const source = quoted || direct

    if (!source) {
      return m.reply('(>_<) Envía una imagen o video con el comando, o responde a uno.')
    }

    const replyTarget = quoted
      ? { key: quoted.key, message: quoted.message, participant: quoted.key?.participant }
      : { key: m.raw?.key || m.key, message: m.message, participant: m.key?.participant }

    const message = quoted?.msg || m.msg
    const mimetype = String(message?.mimetype || '')
    const isVideo = quoted
      ? Boolean(quoted.isVideo || quoted.isGif)
      : m.mtype === 'videoMessage' || /video/i.test(mimetype)

    const withAudio = /(?:^|\s)-aud(?:\s|$)/i.test(`${text || ''} ${m.text || ''} ${args.join(' ')}`)

    if (withAudio && !isVideo) {
      return m.reply('(>_<) Responde a un video con #s -aud para crear un sticker con audio.')
    }

    let input = ''
    let output = ''
    let audioOutput = ''

    try {
      const download = quoted?.download ? quoted.download : m.download
      const buffer = await download()
      if (!buffer?.length) throw new Error('No pude descargar el archivo.')

      input = tempFile('sticker-input', extensionFromMime(mimetype, isVideo ? '.mp4' : '.jpg'))
      fs.writeFileSync(input, buffer)

      const meta = getStickerMeta(m.sender)
      const metadata = {
        packname: meta.pack || botConfig.sticker.pack,
        author: meta.author || botConfig.sticker.author,
        emojis: meta.emojis || botConfig.sticker.emojis,
      }

      if (withAudio) {
        const duration = await probeDuration(input)
        if (duration > botConfig.sticker.audioMaxSeconds) {
          throw new Error(
            `El límite de los stickers con audio es ${botConfig.sticker.audioMaxSeconds} segundos.`
          )
        }

        output = tempFile('sticker-output', '.webp')
        audioOutput = tempFile('sticker-audio', '.ogg')

        await sendAudioSticker({
          sock,
          chat: m.chat,
          inputPath: input,
          outputPath: output,
          audioPath: audioOutput,
          maxSeconds: botConfig.sticker.audioMaxSeconds,
          metadata,
          duration,
          quoted: replyTarget,
        })

        return
      }

      const sticker = await createStickerBuffer(
        { mimetype: mimetype || (isVideo ? 'video/mp4' : 'image/jpeg'), data: buffer },
        metadata
      )

      return m.send({ sticker }, { quoted: replyTarget })
    } catch (error: any) {
      return m.reply(`(x_x) No pude crear el sticker: ${error?.message || 'error desconocido'}`)
    } finally {
      removeFile(input)
      removeFile(output)
      removeFile(audioOutput)
    }
  },
}
