/*
 * Stickers con audio (-aud), al estilo de Viko.
 * Se parchea el proto de Baileys para poder enviar
 * audioStickerMessage con la pista opus dentro del sticker.
 */
import crypto from 'crypto'
import {
  downloadContentFromMessage,
  jidNormalizedUser,
  proto,
  prepareWAMessageMedia,
} from '@whiskeysockets/baileys'
import { convertVideoForAudioSticker, extractAudioOpus, type StickerMetadata } from './exif.ts'

let patched = false

function readVarint(buffer: Buffer, offset: number): { value: number; next: number } | null {
  let value = 0
  let shift = 0
  let position = offset
  while (position < buffer.length && shift <= 49) {
    const byte = buffer[position++]
    value += (byte & 0x7f) * 2 ** shift
    if (!(byte & 0x80)) return { value, next: position }
    shift += 7
  }
  return null
}

function rawFields(buffer: Buffer): Array<{ field: number; wire: number; data: Buffer }> {
  const fields: Array<{ field: number; wire: number; data: Buffer }> = []
  let position = 0
  while (position < buffer.length) {
    const tag = readVarint(buffer, position)
    if (!tag) break
    position = tag.next
    const field = Math.floor(tag.value / 8)
    const wire = tag.value % 8
    if (!field) break

    if (wire === 0) {
      const value = readVarint(buffer, position)
      if (!value) break
      position = value.next
      continue
    }
    if (wire === 1) {
      position += 8
      continue
    }
    if (wire === 2) {
      const length = readVarint(buffer, position)
      if (!length) break
      const start = length.next
      const end = start + length.value
      if (end > buffer.length) break
      fields.push({ field, wire, data: buffer.subarray(start, end) })
      position = end
      continue
    }
    if (wire === 5) {
      position += 4
      continue
    }
    break
  }
  return fields
}

function rawField(buffer: Buffer, number: number): Buffer | null {
  return rawFields(buffer).find(field => field.field === number && field.wire === 2)?.data || null
}

function decodeStickerWithAudio(M: any, stickerBytes: Buffer): any {
  const sticker = M.StickerMessage.decode(stickerBytes)
  const audioBytes = rawField(stickerBytes, 26)
  if (audioBytes) {
    try {
      sticker.audioMessage = M.AudioMessage.decode(audioBytes)
    } catch {}
  }
  return sticker
}

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

  const previousDecode = M.decode

  M.decode = function (reader: any, length: number) {
    const isBuffer = Buffer.isBuffer(reader)
    const start = isBuffer ? 0 : Number(reader?.pos || 0)
    const end = isBuffer
      ? Number(length ?? reader.length)
      : Number(length === undefined ? reader?.len : start + length)
    const result = previousDecode.call(this, reader, length)
    const source = isBuffer ? reader : reader?.buf
    if (!Buffer.isBuffer(source) || !result) return result

    const raw = source.subarray(start, Math.min(start + (end - start), source.length))
    if (!raw.length) return result

    const wrapperBytes = rawField(raw, 134)
    if (wrapperBytes) {
      const innerBytes = rawField(wrapperBytes, 1)
      if (!innerBytes) return result
      const inner = previousDecode.call(this, innerBytes)
      const stickerBytes = rawField(innerBytes, 26)
      if (stickerBytes) {
        const sticker = decodeStickerWithAudio(this, stickerBytes)
        if (inner?.stickerMessage) {
          inner.stickerMessage = sticker
        } else if (inner) {
          inner.stickerMessage = sticker
        }
      }
      if (inner) {
        for (const [key, value] of Object.entries(inner)) {
          if (value == null) continue
          if ((result as any)[key] == null) (result as any)[key] = value
        }
      }
      if ((inner as any)?.stickerMessage) result.stickerMessage = (inner as any).stickerMessage
    } else {
      const stickerBytes = rawField(raw, 26)
      if (stickerBytes && result.stickerMessage) {
        const audioBytes = rawField(stickerBytes, 26)
        if (audioBytes) {
          try {
            result.stickerMessage.audioMessage = this.AudioMessage.decode(audioBytes)
          } catch {}
        }
      }
    }

    return result
  }

  M.__tensuraAudioStickerPatched = true
}

export async function downloadStickerAudio(audioMessage: any): Promise<Buffer> {
  if (!audioMessage || (!audioMessage.mediaKey && !audioMessage.directPath && !audioMessage.url)) {
    throw new Error('El sticker no contiene un audio válido.')
  }
  const stream = await downloadContentFromMessage(audioMessage, 'audio')
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  if (!chunks.length) throw new Error('No pude descargar el audio del sticker.')
  return Buffer.concat(chunks)
}

export async function sendPreparedAudioSticker({
  sock,
  chat,
  stickerBuffer,
  audioBuffer,
  seconds = 5,
  isAnimated = true,
  ptt = true,
  quoted,
}: {
  sock: any
  chat: string
  stickerBuffer: Buffer
  audioBuffer: Buffer
  seconds?: number
  isAnimated?: boolean
  ptt?: boolean
  quoted?: any
}) {
  if (!sock?.relayMessage || !sock?.waUploadToServer) {
    throw new Error('Faltan funciones de Baileys para enviar el sticker con audio.')
  }

  patchAudioStickerProtocol()

  const upload = sock.waUploadToServer.bind(sock)
  const mediaOptions = {
    upload,
    jid: chat,
    logger: sock.logger,
  } as any

  const [audioPrepared, stickerPrepared] = await Promise.all([
    prepareWAMessageMedia(
      {
        audio: audioBuffer,
        mimetype: 'audio/ogg; codecs=opus',
      } as any,
      mediaOptions
    ),
    prepareWAMessageMedia({ sticker: stickerBuffer } as any, mediaOptions),
  ])

  const prepared: any = stickerPrepared
  const audioMessage = (audioPrepared as any)?.audioMessage
  if (!audioMessage) throw new Error('Baileys no pudo preparar el audio.')

  const safeSeconds = Math.max(1, Math.round(Number(seconds) || 5))
  audioMessage.seconds = safeSeconds
  audioMessage.ptt = Boolean(ptt)
  audioMessage.mimetype = 'audio/ogg; codecs=opus'

  if (!audioMessage.waveform?.length) {
    const waveform = Buffer.alloc(64)
    for (let i = 0; i < waveform.length; i++) {
      waveform[i] = 18 + ((audioBuffer[(i * 19 + 7) % audioBuffer.length] || 0) % 76)
    }
    audioMessage.waveform = waveform
  }

  if (!prepared?.stickerMessage) {
    throw new Error('Baileys no pudo preparar el sticker.')
  }

  prepared.stickerMessage.isAnimated = Boolean(isAnimated)
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
  return { seconds: safeSeconds, stickerBuffer }
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
  const [stickerBuffer, audio] = await Promise.all([
    convertVideoForAudioSticker(inputPath, outputPath, maxSeconds, metadata, duration),
    extractAudioOpus(inputPath, audioPath, maxSeconds, duration),
  ])

  return sendPreparedAudioSticker({
    sock,
    chat,
    stickerBuffer,
    audioBuffer: audio.oggBuffer,
    seconds: Math.min(maxSeconds, audio.seconds || 5),
    isAnimated: true,
    quoted,
  })
}
