/*
 * Descargas y APIs usadas por los comandos de dow/.
 * Todas las claves salen de settings.ts / .env.
 */
import fs from 'fs'
import path from 'path'
import axios from 'axios'
import { Readable, Transform } from 'stream'
import { pipeline } from 'stream/promises'
import botConfig from '../settings.ts'
import { ensureTmpDir, formatBytes, sanitizeFilename, tempFile } from './utils.ts'

const API_TIMEOUT_MS = 30_000
const TEXT_TIMEOUT_MS = 30_000
const BUFFER_TIMEOUT_MS = 90_000
const FILE_TIMEOUT_MS = 120_000
const SEARCH_TIMEOUT_MS = 20_000

function withDeadline<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms)
      timer.unref?.()
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

export const http = axios.create({
  timeout: API_TIMEOUT_MS,
  maxRedirects: 5,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },
})

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: '*/*',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
}

export async function getJson(url: string, config: any = {}) {
  try {
    const response = await http.get(url, { ...config, responseType: 'json' })
    return response.data
  } catch (error: any) {
    const data = error?.response?.data
    const message = data?.error?.message || data?.message
    if (message) throw new Error(message)
    throw error
  }
}

export async function getText(url: string, config: any = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Number(config.timeout) || TEXT_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      headers: { ...BROWSER_HEADERS, ...(config.headers || {}) },
      redirect: 'follow',
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.text()
  } finally {
    clearTimeout(timer)
  }
}

export async function getBuffer(url: string, maxBytes = botConfig.download.maxBytes) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), BUFFER_TIMEOUT_MS)
  try {
    const response = await fetch(url, { headers: BROWSER_HEADERS, redirect: 'follow', signal: controller.signal })
    if (!response.ok) throw new Error(`No se pudo descargar el archivo (HTTP ${response.status}).`)
    const length = Number(response.headers.get('content-length') || 0)
    if (length && length > maxBytes) {
      throw new Error(`El archivo pesa ${formatBytes(length)} y el límite es ${formatBytes(maxBytes)}.`)
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length > maxBytes) {
      throw new Error(`El archivo pesa ${formatBytes(buffer.length)} y el límite es ${formatBytes(maxBytes)}.`)
    }
    return buffer
  } finally {
    clearTimeout(timer)
  }
}

export async function downloadToFile(
  url: string,
  filePath: string,
  maxBytes = botConfig.download.maxBytes
) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FILE_TIMEOUT_MS)
  try {
    const response = await fetch(url, { headers: BROWSER_HEADERS, redirect: 'follow', signal: controller.signal })
    if (!response.ok || !response.body) {
      throw new Error(`No se pudo descargar el archivo (HTTP ${response.status}).`)
    }

    const length = Number(response.headers.get('content-length') || 0)
    if (length && length > maxBytes) {
      throw new Error(`El archivo pesa ${formatBytes(length)} y el límite es ${formatBytes(maxBytes)}.`)
    }

    let total = 0
    const counter = new Transform({
      transform(chunk, _encoding, callback) {
        total += chunk.length
        if (total > maxBytes) {
          callback(new Error(`El archivo supera el límite de ${formatBytes(maxBytes)}.`))
          return
        }
        callback(null, chunk)
      },
    })

    await pipeline(Readable.fromWeb(response.body as any), counter, fs.createWriteStream(filePath))
    return {
      size: total || length,
      contentType: String(response.headers.get('content-type') || ''),
      filename: filenameFromHeaders(response.headers.get('content-disposition')) || path.basename(filePath),
    }
  } catch (error) {
    fs.rmSync(filePath, { force: true })
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function filenameFromHeaders(value: any): string {
  const header = String(value || '')
  const utf8 = header.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1])
    } catch {}
  }
  const basic = header.match(/filename="?([^";]+)"?/i)
  return basic ? basic[1] : ''
}

export function ensureDownloadDir() {
  ensureTmpDir()
  return ensureTmpDir()
}

export function downloadFile(prefix: string, extension: string) {
  return tempFile(prefix, extension)
}

export function cleanup(...files: (string | null | undefined)[]) {
  for (const file of files) {
    if (!file) continue
    try {
      fs.rmSync(file, { force: true })
    } catch {}
  }
}

export { formatBytes, sanitizeFilename }

export async function evogb(endpoint: string, params: Record<string, any> = {}) {
  const url = new URL(`${botConfig.api.evogb.url}${endpoint}`)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  }
  url.searchParams.set('key', botConfig.api.evogb.key)
  return getJson(url.toString())
}

export async function raylais(endpoint: string, params: Record<string, any> = {}) {
  const url = new URL(`${botConfig.api.raylais.url}${endpoint}`)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  }
  return getJson(url.toString(), {
    headers: { 'x-api-key': botConfig.api.raylais.key },
  })
}

export function parseYouTubeId(value: string): string {
  const text = String(value || '').trim()
  if (/^[\w-]{11}$/.test(text)) return text
  const match = /(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/.exec(text)
  return match ? match[1] : ''
}

export async function searchYouTube(query: string, limit = 8) {
  const mod: any = await import('yt-search')
  const yts = mod?.default || mod
  const result = await withDeadline(
    Promise.resolve().then(() => yts(query)),
    SEARCH_TIMEOUT_MS,
    'La búsqueda en YouTube tardó demasiado.'
  )
  return (result?.videos || []).slice(0, limit).map((video: any) => ({
    url: `https://youtu.be/${video.videoId}`,
    videoId: video.videoId,
    title: video.title || 'YouTube',
    author: video.author?.name || '',
    duration: video.duration?.timestamp || '',
    views: video.views ? `${video.views.toLocaleString('es-ES')} vistas` : '',
    thumbnail: video.thumbnail || '',
  }))
}

export async function resolveYouTube(input: string) {
  const text = String(input || '').trim()
  const id = parseYouTubeId(text)

  if (id) {
    const mod: any = await import('yt-search')
    const yts = mod?.default || mod
    const result = await withDeadline(
      Promise.resolve().then(() => yts({ videoId: id })),
      SEARCH_TIMEOUT_MS,
      'YouTube tardó demasiado en responder.'
    )
    if (result?.videoId) {
      return {
        url: `https://youtu.be/${result.videoId}`,
        videoId: result.videoId,
        title: result.title || 'YouTube',
        author: result.author?.name || '',
        duration: result.duration?.timestamp || '',
        views: result.views ? `${result.views.toLocaleString('es-ES')} vistas` : '',
        thumbnail: result.thumbnail || '',
      }
    }
  }

  const results = await searchYouTube(text, 1)
  if (!results.length) throw new Error('No encontré resultados en YouTube.')
  return results[0]
}

export async function youtubeDownload(url: string, format: 'audio' | 'video', mode = 'medium') {
  const apiFormat = format === 'audio' ? 'mp3' : 'mp4'
  const json = await raylais('/api/dl/yt', { url, format: apiFormat, mode })
  if (json?.success === false) {
    throw new Error(json?.error?.message || 'La API no pudo procesar el video.')
  }
  const direct = json?.url || json?.data?.url || json?.download
  if (!direct) throw new Error('La API no devolvió un enlace de descarga.')
  return {
    url: direct,
    title: json?.title || '',
    duration: json?.duration || '',
    size: json?.size || '',
  }
}
