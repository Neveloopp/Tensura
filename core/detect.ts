/*
 * Detectores rápidos de tipo de contenido y enlaces.
 */
export function detectMedia(m: any) {
  const type = m?.mtype || m?.quoted?.mtype || ''
  if (type === 'imageMessage') return 'image'
  if (type === 'videoMessage') return 'video'
  if (type === 'audioMessage') return 'audio'
  if (type === 'stickerMessage') return 'sticker'
  if (type === 'documentMessage') return 'document'
  return 'text'
}

export const isImage = (m: any) => detectMedia(m) === 'image'
export const isVideo = (m: any) => detectMedia(m) === 'video'
export const isAudio = (m: any) => detectMedia(m) === 'audio'
export const isSticker = (m: any) => detectMedia(m) === 'sticker'

export function detectUrl(text: string): string {
  const match = String(text || '').match(/https?:\/\/[^\s]+/i)
  return match ? match[0] : ''
}

export function detectPlatform(url: string): string {
  const value = String(url || '').toLowerCase()
  if (/youtube\.com|youtu\.be/.test(value)) return 'youtube'
  if (/tiktok\.com/.test(value)) return 'tiktok'
  if (/instagram\.com/.test(value)) return 'instagram'
  if (/facebook\.com|fb\.watch/.test(value)) return 'facebook'
  if (/mediafire\.com/.test(value)) return 'mediafire'
  if (/pinterest\.com|pin\.it/.test(value)) return 'pinterest'
  if (/threads\.com|threads\.net/.test(value)) return 'threads'
  return 'unknown'
}
