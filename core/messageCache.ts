/*
 * Caché acotada de stickers con audio recibidos.
 * WhatsApp suele quitar el audio del mensaje citado, así que se
 * conserva el audio original para poder reutilizarlo al citarlo.
 */
import { unwrapMessage } from './utils.ts'

type CachedAudioSticker = {
  audioMessage: any
  audioBuffer?: Buffer
  ts: number
}

const CACHE_LIMIT = 500
const BUFFER_LIMIT = 16 * 1024 * 1024
const cache = new Map<string, CachedAudioSticker>()
let bufferedBytes = 0

function dropEntry(id: string) {
  const entry = cache.get(id)
  if (entry?.audioBuffer) bufferedBytes -= entry.audioBuffer.length
  cache.delete(id)
}

function stickerOf(message: any): any {
  if (!message) return null
  if (message.stickerMessage) return message.stickerMessage

  const wrapped = message.audioStickerMessage
  const inner = wrapped ? unwrapMessage(wrapped.message || wrapped) : null
  return inner?.stickerMessage || null
}

export function rememberAudioSticker(raw: any, audioBuffer?: Buffer) {
  const id = String(raw?.key?.id || '')
  if (!id) return

  const message = unwrapMessage(raw?.message)
  const sticker = stickerOf(message)
  const audio = sticker?.audioMessage || message?.audioMessage
  if (!sticker || (!audio && !audioBuffer)) return

  const previous = cache.get(id)
  const preferredAudio =
    audio && (!previous?.audioMessage || audio.mediaKey || !previous.audioMessage.mediaKey)
      ? audio
      : previous?.audioMessage || audio

  let nextBuffer = audioBuffer || previous?.audioBuffer
  if (nextBuffer && nextBuffer.length > BUFFER_LIMIT) nextBuffer = undefined

  dropEntry(id)
  if (nextBuffer) bufferedBytes += nextBuffer.length
  cache.set(id, {
    audioMessage: preferredAudio,
    audioBuffer: nextBuffer,
    ts: Date.now(),
  })

  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (!oldest) break
    dropEntry(oldest)
  }

  while (bufferedBytes > BUFFER_LIMIT) {
    let removed = false
    for (const [key, entry] of cache) {
      if (!entry.audioBuffer) continue
      bufferedBytes -= entry.audioBuffer.length
      delete entry.audioBuffer
      removed = true
      break
    }
    if (!removed) break
  }
}

export function getCachedAudioSticker(id: any): any {
  const key = String(id || '')
  const entry = cache.get(key)
  if (!entry) return null
  cache.delete(key)
  cache.set(key, entry)
  return entry.audioMessage
}

export function getCachedAudioStickerBuffer(id: any): Buffer | null {
  const key = String(id || '')
  const entry = cache.get(key)
  if (!entry) return null
  cache.delete(key)
  cache.set(key, entry)
  return entry.audioBuffer || null
}

export function clearAudioStickerCache() {
  cache.clear()
  bufferedBytes = 0
}
