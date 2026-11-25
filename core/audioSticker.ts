/*
 * Stickers con audio (-aud), al estilo de Viko.
 * Se parchea el proto de Baileys para poder enviar
 * audioStickerMessage con la pista opus dentro del sticker.
 */
import crypto from 'crypto'
import { jidNormalizedUser, proto, prepareWAMessageMedia } from '@whiskeysockets/baileys'
import { convertVideoForAudioSticker, extractAudioOpus, type StickerMetadata } from './exif.ts'

let patched = false

export function patchAudioStickerProtocol() {
  const M: any = (proto as any)?.Message
  if (!M || patched || M.__tensuraAudioStickerPatched) return
  patched = true

  if (M.StickerMessage?.encode) {
    const previousEncode = M.StickerMessage.encode

    M.StickerMessage.encode = function (message: any, writer: any) {
      const audio = message?.audioMessage
      if (audio && Object.prototype.hasOwnProperty.call(message, 'audioMessage')) {
        delete message.audioMessage
      }

      const result = previousEncode.call(this, message, writer)

      if (audio && M.AudioMessage) {
        message.audioMessage = audio
        M.AudioMessage.encode(audio, result.uint32(210).fork()).ldelim()
      }

      return result
    }

    if (typeof M.StickerMessage.fromObject === 'function') {
      const previousFromObject = M.StickerMessage.fromObject
      M.StickerMessage.fromObject = function (object: any) {
        const message = previousFromObject.call(this, object)
        if (object?.audioMessage) {
          message.audioMessage = M.AudioMessage?.fromObject
            ? M.AudioMessage.fromObject(object.audioMessage)
            : object.audioMessage
        }
        return message
      }
    }
  }

  const previousMessageEncode = M.encode

  M.encode = function (message: any, writer: any) {
    const audioSticker = message?.audioStickerMessage
    if (audioSticker) {
      delete message.stickerMessage
      delete message.audioStickerMessage
    }

    const result = previousMessageEncode.call(this, message, writer)

    if (audioSticker && M.FutureProofMessage) {
      message.audioStickerMessage = audioSticker
      M.FutureProofMessage.encode(audioSticker, result.uint32(1074).fork()).ldelim()
    }

    return result
  }

  if (typeof M.fromObject === 'function') {
    const previousFromObject = M.fromObject
    M.fromObject = function (object: any) {
      const message = previousFromObject.call(this, object)

      if (object?.audioStickerMessage) {
        const inner = object.audioStickerMessage.message || object.audioStickerMessage
        if (
          inner?.stickerMessage &&
          object.audioStickerMessage.message?.stickerMessage?.audioMessage
        ) {
          inner.stickerMessage.audioMessage =
            object.audioStickerMessage.message.stickerMessage.audioMessage
        }
        message.audioStickerMessage = { message: inner }
        delete message.stickerMessage
        if (inner) Object.setPrototypeOf(message, inner)
      }

      return message
    }
  }

  M.__tensuraAudioStickerPatched = true
}

export async function sendAudioSticker({
  sock,
  chat,
  inputPath,
  outputPath,
  audioPath,
  maxSeconds = 25,
  metadata = {},
  duration,
  quoted,
}: {
  sock: any
  chat: string
  inputPath: string
  outputPath: string
  audioPath: string
  maxSeconds?: number
  metadata?: StickerMetadata
  duration?: number
  quoted?: any
}) {
  if (!sock?.relayMessage || !sock?.waUploadToServer) {
    throw new Error('Faltan funciones de Baileys para enviar el sticker con audio.')
  }

  patchAudioStickerProtocol()

  const [stickerBuffer, audio] = await Promise.all([
    convertVideoForAudioSticker(inputPath, outputPath, maxSeconds, metadata, duration),
    extractAudioOpus(inputPath, audioPath, maxSeconds, duration),
  ])
  const { oggBuffer, seconds } = audio
  const upload = sock.waUploadToServer.bind(sock)

  const [audioPrepared, stickerPrepared] = await Promise.all([
    prepareWAMessageMedia(
      {
        audio: oggBuffer,
        mimetype: 'audio/ogg; codecs=opus',
      } as any,
      { upload } as any
    ),
    prepareWAMessageMedia({ sticker: stickerBuffer } as any, { upload } as any),
  ])

  const prepared: any = stickerPrepared
  const audioMessage = (audioPrepared as any)?.audioMessage
  if (!audioMessage) throw new Error('Baileys no pudo preparar el audio.')

  audioMessage.seconds = Math.max(1, Math.min(maxSeconds, Math.round(seconds || 5)))
  audioMessage.ptt = true
  audioMessage.mimetype = 'audio/ogg; codecs=opus'

  if (!audioMessage.waveform?.length) {
    const waveform = Buffer.alloc(64)
    for (let i = 0; i < waveform.length; i++) {
      waveform[i] = 18 + ((oggBuffer[(i * 19 + 7) % oggBuffer.length] || 0) % 76)
    }
    audioMessage.waveform = waveform
  }

  if (!prepared?.stickerMessage) {
    throw new Error('Baileys no pudo preparar el sticker.')
  }

  prepared.stickerMessage.isAnimated = true
  prepared.stickerMessage.audioMessage = audioMessage

  if (quoted?.key?.id && quoted?.message) {
    const participant = quoted.key.fromMe
      ? jidNormalizedUser(sock.user?.id || '')
      : jidNormalizedUser(
          quoted.participant || quoted.key.participant || quoted.key.remoteJid || ''
        )

    prepared.stickerMessage.contextInfo = {
      ...(prepared.stickerMessage.contextInfo || {}),
      stanzaId: quoted.key.id,
      quotedMessage: proto.Message.create(quoted.message),
      ...(participant ? { participant } : {}),
      ...(quoted.key.remoteJid && quoted.key.remoteJid !== chat
        ? { remoteJid: quoted.key.remoteJid }
        : {}),
    }
  }

  const payload: any = {
    ...prepared,
    audioStickerMessage: { message: prepared },
    messageContextInfo: {
      messageSecret: crypto.randomBytes(32),
    },
  }

  await sock.relayMessage(chat, payload, {})
  return { seconds, stickerBuffer }
}
