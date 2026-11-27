/*
 * Caché acotada de stickers con audio y mensajes de una sola vista.
 * WhatsApp suele quitar el audio o los metadatos multimedia del mensaje
 * citado, así que se conserva el mensaje original para poder reutilizarlo.
 */
import { isViewOnceMessage, unwrapMessage } from './utils.ts'

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

type CachedViewOnce = {
  message: any
  timestamp: number
  ts: number
}

const VIEW_ONCE_LIMIT = 300
const VIEW_ONCE_TTL = 14 * 24 * 60 * 60 * 1000
const viewOnceCache = new Map<string, CachedViewOnce>()

function viewOnceTimestamp(raw: any) {
  const value = Number(raw?.messageTimestamp)
  if (!Number.isFinite(value) || value <= 0) return Date.now()
  return value < 1_000_000_000_000 ? value * 1000 : value
}

export function rememberViewOnce(raw: any) {
  const id = String(raw?.key?.id || '')
  if (!id || !isViewOnceMessage(raw?.message)) return

  viewOnceCache.delete(id)
  viewOnceCache.set(id, {
    message: raw.message,
    timestamp: viewOnceTimestamp(raw),
    ts: Date.now(),
  })

  while (viewOnceCache.size > VIEW_ONCE_LIMIT) {
    const oldest = viewOnceCache.keys().next().value
    if (!oldest) break
    viewOnceCache.delete(oldest)
  }
}

export function getCachedViewOnce(id: any): CachedViewOnce | null {
  const key = String(id || '')
  if (!key) return null
  const entry = viewOnceCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > VIEW_ONCE_TTL) {
    viewOnceCache.delete(key)
    return null
  }
  return entry
}
