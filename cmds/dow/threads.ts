/*
 * Threads: descarga videos o imágenes de una publicación.
 * Adaptado del scraper threadsmate de Viko.
 */
import { getBuffer } from '../../core/downloader.ts'

const NETWORK_TIMEOUT_MS = 20_000

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Upgrade-Insecure-Requests': '1',
}

function decode(value: string) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&#x2F;/gi, '/')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function extract(html: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) return decode(match[1]).trim()
  }
  return ''
}

async function scrapeThreads(url: string) {
  const home = await fetch('https://threadsmate.com/', {
    headers: HEADERS,
    signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
  })
  const rawCookies = (home.headers as any).getSetCookie?.() || []
  const cookies = rawCookies.length
    ? rawCookies.map((cookie: string) => cookie.split(';')[0].trim())
    : String(home.headers.get('set-cookie') || '')
        .split(',')
        .map(cookie => cookie.split(';')[0].trim())
        .filter(Boolean)

  const html = await home.text()
  let tokenName = ''
  let tokenValue = ''

  for (const input of html.match(/<input[^>]*>/gi) || []) {
    if (!/type="hidden"/i.test(input) || /name="lang"/i.test(input)) continue
    const name = input.match(/name="([^"]*)"/i)?.[1]
    const value = input.match(/value="([^"]*)"/i)?.[1]
    if (name && value !== undefined) {
      tokenName = name
      tokenValue = value
      break
    }
  }

  if (!tokenName) throw new Error('No pude obtener el token de Threads.')

  const body = new URLSearchParams()
  body.append('url', url)
  body.append(tokenName, tokenValue)
  body.append('lang', 'en')

  const response = await fetch('https://threadsmate.com/action', {
    method: 'POST',
    headers: {
      ...HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: 'https://threadsmate.com/',
      Origin: 'https://threadsmate.com',
      'X-Requested-With': 'XMLHttpRequest',
      Cookie: cookies.join('; '),
    },
    body: body.toString(),
    signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
  })

  const json = await response.json().catch(() => ({} as any))
  if (json?.error) throw new Error(json?.message || 'Threads rechazó el enlace.')
  if (!json?.html) throw new Error('Threads no devolvió contenido.')

  const resultHtml = String(json.html)
  const title = extract(resultHtml, [
    /class="hover-underline"[^>]*>([^<]+)</i,
    /<h2[^>]*>([^<]+)<\/h2>/i,
    /<div[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/div>/i,
  ])
  const author = extract(resultHtml, [
    /class="threadsmate-downloader-middle"[^>]*>[\s\S]*?<p[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/i,
    /<div[^>]*class="[^"]*author[^"]*"[^>]*>([^<]+)<\/div>/i,
  ])
  const thumbnail = extract(resultHtml, [
    /class="threadsmate-downloader-left"[^>]*>[\s\S]*?<img[^>]*src="([^"]*)"/i,
    /<img[^>]*class="[^"]*thumbnail[^"]*"[^>]*src="([^"]*)"/i,
  ])
  let video = extract(resultHtml, [
    /class="download-items__btn"[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"/i,
    /<a[^>]*class="[^"]*download-btn[^"]*"[^>]*href="([^"]*)"/i,
    /<a[^>]*href="([^"]*)"[^>]*download[^>]*>/i,
  ])
  const preview = extract(resultHtml, [
    /class="download-items__thumb"[^>]*>[\s\S]*?<img[^>]*src="([^"]*)"/i,
    /<img[^>]*class="[^"]*preview[^"]*"[^>]*src="([^"]*)"/i,
  ])

  if (!video) {
    video = extract(resultHtml, [/<video[^>]*>[\s\S]*?<source[^>]*src="([^"]*)"[^>]*>/i])
  }

  if (!video) {
    const jsonLd = resultHtml.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i)
    if (jsonLd) {
      try {
        const parsed = JSON.parse(jsonLd[1])
        if (parsed?.contentUrl) video = parsed.contentUrl
      } catch {}
    }
  }

  return {
    title: title || 'Threads',
    author: author || 'Desconocido',
    thumbnail: thumbnail || preview,
    video,
    image: preview || thumbnail,
  }
}

export default {
  command: ['threads', 'thread', 'th'],
  category: 'dow',
  description: 'Descarga contenido de Threads.',
  usage: '<enlace>',
  example: ['#threads https://www.threads.com/@usuario/post/...'],
  async run({ sock, m, args, text }: any) {
    const url = String(args[0] || text || '').trim()
    if (!url || !/threads\.(com|net)/i.test(url)) {
      return m.reply('(>_<) Envíame un enlace válido de Threads.')
    }

    const normalized = url.replace('threads.com', 'threads.net')
    const status = await m.reply('(^_^) Obteniendo información de Threads...')

    try {
      const data = await scrapeThreads(normalized)
      await sock.sendMessage(m.chat, { delete: status.key }).catch(() => null)

      const caption = [
        `(＾▽＾) *${data.title}*`,
        '',
        `• Autor: ${data.author}`,
        `• Solicitado por: ${m.pushName || 'usuario'}`,
      ].join('\n')

      if (data.video) {
        const buffer = await getBuffer(data.video)
        return m.send({
          video: buffer,
          mimetype: 'video/mp4',
          fileName: `threads-${Date.now()}.mp4`,
          caption,
        })
      }

      if (data.image) {
        const buffer = await getBuffer(data.image)
        return m.send({ image: buffer, caption })
      }

      throw new Error('No encontré video ni imagen en esta publicación.')
    } catch (error: any) {
      await sock.sendMessage(m.chat, { delete: status.key }).catch(() => null)
      return m.reply(`(x_x) ${error?.message || 'No pude descargar la publicación.'}`)
    }
  },
}
