/*
 * Reenvía el archivo citado, incluidos los de una sola vista.
 * Para los de una vista usa la copia original guardada al recibirla:
 * WhatsApp suele quitar url/directPath de la cita.
 */
import { isViewOnceMessage, messageType, unwrapMessage } from '../../core/utils.ts'

const MAX_AGE = 14 * 24 * 60 * 60 * 1000
const MAX_DOWNLOAD = 6 * 1024 * 1024

function cleanViewOnce(message: any) {
  const content = unwrapMessage(message)
  if (!content) return null

  const type = messageType(content)
  const payload = type ? content[type] : null
  if (!type || !payload || typeof payload !== 'object') return null

  const cleaned = { ...content, [type]: { ...payload } }
  delete cleaned[type].viewOnce
  return cleaned
}

async function relayOriginal(sock: any, m: any, quoted: any) {
  const source = quoted.originalMessage || quoted.raw || quoted.message
  const content = cleanViewOnce(source)
  if (!content) throw new Error('No pude reconstruir el mensaje original.')

  const messageId = await sock.relayMessage(m.chat, content, {})
  if (!messageId) throw new Error('WhatsApp no confirmó el reenvío.')
  return messageId
}

async function sendMedia(m: any, quoted: any, buffer: Buffer) {
  const message = quoted.msg || {}
  const mimetype = String(message.mimetype || '')
  const caption = message.caption || ''

  if (quoted.isImage) {
    return m.send({ image: buffer, caption, ...(mimetype ? { mimetype } : {}) })
  }
  if (quoted.isVideo) {
    return m.send({
      video: buffer,
      caption,
      mimetype: mimetype || 'video/mp4',
      gifPlayback: Boolean(quoted.isGif || message.gifPlayback),
    })
  }
  if (quoted.isAudio) {
    return m.send({
      audio: buffer,
      mimetype: mimetype || 'audio/ogg; codecs=opus',
      ptt: Boolean(message.ptt),
      seconds: message.seconds,
    })
  }
  return m.send({ sticker: buffer })
}

export default {
  command: ['ver', 'viewonce', 'vo', 'rvo'],
  category: 'otros',
  description: 'Recupera y reenvía una imagen, video, audio o sticker citado, incluidos los de una sola vista.',
  usage: '',
  example: ['#ver (respondiendo a una imagen, video, audio o sticker)'],
  async run({ sock, m }: any) {
    const quoted = m.quoted
    if (!quoted) {
      return m.reply(
        '(>_<) Responde a una imagen, video, audio o sticker para reenviarlo.'
      )
    }

    const message = quoted.msg || {}
    const quotedType = String(quoted.mtype || quoted.type || '')
    const mimetype = String(message.mimetype || '')
    const isImage = Boolean(quoted.isImage || quotedType === 'imageMessage' || /^image\//i.test(mimetype))
    const isVideo = Boolean(
      quoted.isVideo || quoted.isGif || quotedType === 'videoMessage' || /^video\//i.test(mimetype)
    )
    const isAudio = Boolean(quoted.isAudio || quotedType === 'audioMessage' || /^audio\//i.test(mimetype))
    const isSticker = Boolean(quoted.isSticker || quotedType === 'stickerMessage')
    const isMedia = isImage || isVideo || isAudio || isSticker
    const isViewOnce = Boolean(
      quoted.viewOnce ||
        isViewOnceMessage(quoted.raw) ||
        isViewOnceMessage(quoted.originalMessage) ||
        isViewOnceMessage(quoted.message)
    )

    if (!isMedia) {
      if (isViewOnce) {
        const text = quoted.text
        if (typeof text === 'string' && text.trim()) {
          await m.react('✅')
          return m.reply(text)
        }
        return m.reply('(>_<) El mensaje de una sola vista no contiene un archivo compatible.')
      }
      return m.reply('(>_<) El mensaje citado no contiene una imagen, video, audio o sticker.')
    }

    if (isViewOnce && quoted.messageTimestamp) {
      const age = Date.now() - Number(quoted.messageTimestamp)
      if (Number.isFinite(age) && age > MAX_AGE) {
        const days = Math.floor(age / (24 * 60 * 60 * 1000))
        return m.reply(
          `(>_<) Este mensaje de una sola vista fue enviado hace ${days} días y supera el límite de 14 días.`
        )
      }
    }

    try {
      const fileLength = Number(quoted.fileLength || message.fileLength || 0)
      let buffer: Buffer | undefined

      if (isViewOnce && fileLength > MAX_DOWNLOAD) {
        await relayOriginal(sock, m, quoted)
        await m.react('✅')
        return
      }

      try {
        const download = quoted.download || m.download
        buffer = await download()
      } catch (error) {
        if (!isViewOnce) throw error
        await relayOriginal(sock, m, quoted)
        await m.react('✅')
        return
      }

      if (!buffer?.length) throw new Error('El archivo citado está vacío.')

      await sendMedia(m, quoted, buffer)
      await m.react('✅')
    } catch (error: any) {
      return m.reply(`(x_x) No pude recuperar el archivo citado: ${error?.message || 'error desconocido'}`)
    }
  },
}
