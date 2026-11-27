import axios from 'axios'
import botConfig from '../settings.ts'

const MAX_RESULT_CHARS = 12_000
const MAX_PROMPT_CHARS = 4_000

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
}

const WIKI_HEADERS = {
  'User-Agent': 'TensuraBot/1.0 (https://github.com/Neveloopp/Tensura)',
  Accept: 'application/json',
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export type AIStep = {
  title: string
  body?: string
  reasoning?: boolean
}

type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: any
  tool_calls?: any[]
  tool_call_id?: string
  name?: string
}

type ModelCaller = (messages: ChatMessage[], tools: boolean) => Promise<any>

export const AI_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search',
      description:
        'Busca información actual en la web. Úsala para noticias, datos recientes, precios o cualquier cosa que pueda haber cambiado.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Consulta de búsqueda.' },
          limit: {
            type: 'integer',
            description: 'Cantidad de resultados entre 1 y 8.',
            minimum: 1,
            maximum: 8,
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_url',
      description:
        'Lee el contenido público de una URL HTTP o HTTPS. No sirve para archivos locales, direcciones privadas ni servicios internos.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL pública que se quiere leer.' },
        },
        required: ['url'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'wikipedia',
      description: 'Busca y resume un artículo de Wikipedia en español o en otro idioma.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Tema o título a buscar.' },
          lang: {
            type: 'string',
            description: 'Código de idioma de Wikipedia, por ejemplo es o en.',
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'weather',
      description: 'Consulta el clima actual de una ciudad o lugar.',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'Ciudad o lugar.' },
        },
        required: ['city'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'time',
      description: 'Devuelve la fecha y la hora actual en una zona horaria.',
      parameters: {
        type: 'object',
        properties: {
          timezone: {
            type: 'string',
            description: 'Zona horaria IANA, por ejemplo America/Havana.',
          },
        },
        additionalProperties: false,
      },
    },
  },
]

function decodeEntities(value: string) {
  return String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
}

function cleanText(value: string) {
  return decodeEntities(String(value).replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeDuckLink(value: string) {
  try {
    const url = new URL(decodeEntities(value), 'https://duckduckgo.com')
    return url.searchParams.get('uddg') || url.toString()
  } catch {
    return value
  }
}

export function parseDuckDuckGo(html: string, limit = 5) {
  const anchors = [
    ...String(html).matchAll(/<a\b[^>]*class="[^"]*result__a[^"]*"[^>]*>([\s\S]*?)<\/a>/gi),
  ]
  const snippets = [
    ...String(html).matchAll(
      /<a\b[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi
    ),
  ]

  return anchors
    .slice(0, Math.max(1, Math.min(8, limit)))
    .map((anchor, index) => {
      const href = anchor[0].match(/\bhref="([^"]+)"/i)?.[1] || ''
      return {
        title: cleanText(anchor[1]),
        url: decodeDuckLink(href),
        snippet: cleanText(snippets[index]?.[1] || ''),
      }
    })
    .filter(result => result.title && result.url)
}

function stripMarkdown(value: string) {
  return decodeEntities(
    String(value)
      .replace(/\[Read more\]\([^)]+\)/gi, ' ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_`#]+/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeBingUrl(value: string) {
  try {
    const url = new URL(decodeEntities(value))
    const encoded = url.searchParams.get('u')
    if (encoded) {
      const raw = encoded.startsWith('a1') ? encoded.slice(2) : encoded
      try {
        const decoded = Buffer.from(raw, 'base64url').toString('utf8')
        if (/^https?:\/\//i.test(decoded)) return decoded
      } catch {}
    }
    return url.toString()
  } catch {
    return value
  }
}

export function parseJinaBing(markdown: string, limit = 5) {
  const lines = String(markdown).split(/\r?\n/)
  const results: Array<{ title: string; url: string; snippet: string }> = []

  for (let index = 0; index < lines.length && results.length < limit; index++) {
    const heading = lines[index].match(/##\s+\[([^\]]+)\]\((https?:\/\/[^)]+)\)/)
    if (!heading) continue

    const title = stripMarkdown(heading[1])
    const url = decodeBingUrl(heading[2])
    if (!title || !url || /^read more$/i.test(title)) continue

    const snippets: string[] = []
    for (let next = index + 1; next < lines.length; next++) {
      if (/^(##|####)\s+/.test(lines[next]) || /^\s*\d+\.\s+/.test(lines[next])) break
      const snippet = stripMarkdown(lines[next])
      if (!snippet) continue
      if (/^(Title|URL Source|Final URL|Markdown Content):/i.test(snippet)) continue
      if (/^!\[Image/i.test(snippet)) continue
      snippets.push(snippet)
      if (snippets.join(' ').length > 500) break
    }

    results.push({
      title,
      url,
      snippet: snippets.join(' ').replace(/\s*Read more\b.*$/i, '').slice(0, 400),
    })
  }

  return results
}

async function searchBingJina(query: string, limit: number) {
  const spanish =
    /[áéíóúñ¿¡]|\b(?:el|la|los|las|de|del|que|y|en|hoy|noticias|precio|clima|qué|cómo|por|para)\b/i.test(
      query
    )
  const response = await axios.get(
    `https://r.jina.ai/http://www.bing.com/search?q=${encodeURIComponent(query)}${spanish ? '&cc=es' : ''}`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Accept: 'text/plain',
      },
      timeout: 30_000,
      responseType: 'text',
      maxContentLength: 800_000,
    }
  )
  return parseJinaBing(response.data, limit)
}

async function searchWeb(query: string, limit = 5) {
  const q = String(query || '').trim().slice(0, 300)
  if (!q) throw new Error('Falta la consulta de búsqueda.')
  const max = Math.max(1, Math.min(8, Math.floor(Number(limit) || 5)))
  let lastError: any

  try {
    const response = await axios.get('https://html.duckduckgo.com/html/', {
      params: { q },
      headers: BROWSER_HEADERS,
      timeout: 15_000,
      responseType: 'text',
      maxContentLength: 800_000,
    })
    const results = parseDuckDuckGo(response.data, max)
    if (results.length) return { query: q, results }
  } catch (error) {
    lastError = error
  }

  try {
    const response = await axios.get('https://api.duckduckgo.com/', {
      params: { q, format: 'json', no_html: 1, skip_disambig: 1 },
      headers: BROWSER_HEADERS,
      timeout: 15_000,
    })
    const data = response.data || {}
    const results: Array<{ title: string; url: string; snippet: string }> = []
    if (data.AbstractText) {
      results.push({
        title: String(data.Heading || q),
        url: String(data.AbstractURL || ''),
        snippet: String(data.AbstractText),
      })
    }
    for (const topic of Array.isArray(data.RelatedTopics) ? data.RelatedTopics : []) {
      if (results.length >= max) break
      if (!topic?.Text) continue
      results.push({
        title: String(topic.Text).split(' - ')[0],
        url: String(topic.FirstURL || ''),
        snippet: String(topic.Text),
      })
    }
    if (results.length) return { query: q, results: results.slice(0, max) }
  } catch (error) {
    lastError = error
  }

  try {
    const results = await searchBingJina(q, max)
    if (results.length) return { query: q, results }
  } catch (error) {
    lastError = error
  }

  return {
    query: q,
    results: [],
    note: lastError
      ? `No se pudo completar la búsqueda: ${String(lastError?.message || lastError).slice(0, 160)}`
      : 'La búsqueda no devolvió resultados.',
  }
}

function isPrivateHost(hostname: string) {
  const host = String(hostname || '')
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
  if (!host) return true
  if (['localhost', '127.0.0.1', '0.0.0.0', '::1', '::'].includes(host)) return true
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) {
    return true
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const [a, b] = ipv4.slice(1).map(Number)
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    )
  }

  if (host.includes(':')) {
    return (
      host.startsWith('fc') ||
      host.startsWith('fd') ||
      host.startsWith('fe80') ||
      host.startsWith('::ffff:')
    )
  }

  return false
}

function publicUrl(value: string) {
  let url: URL
  try {
    url = new URL(String(value || '').trim())
  } catch {
    throw new Error('La URL no es válida.')
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Solo se permiten URLs HTTP o HTTPS.')
  }
  if (isPrivateHost(url.hostname)) {
    throw new Error('No se permiten direcciones privadas ni locales.')
  }
  return url
}

function stripHtml(value: string) {
  return decodeEntities(
    String(value)
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim()
}

async function readUrl(value: string) {
  const url = publicUrl(value)
  const config: any = {
    headers: BROWSER_HEADERS,
    timeout: 20_000,
    responseType: 'text',
    maxContentLength: 500_000,
    maxRedirects: 4,
    beforeRedirect: (options: any) => {
      if (isPrivateHost(String(options?.hostname || ''))) {
        throw new Error('La URL redirige a una dirección privada.')
      }
    },
  }
  const response = await axios.get(url.toString(), config)
  const contentType = String(response.headers?.['content-type'] || '')
  let text = String(response.data ?? '')

  if (/json/i.test(contentType)) {
    try {
      text = JSON.stringify(JSON.parse(text), null, 2)
    } catch {}
  } else if (/html|xml/i.test(contentType) || /^\s*</.test(text)) {
    text = stripHtml(text)
  }

  return {
    url: url.toString(),
    contentType,
    text: text.slice(0, MAX_RESULT_CHARS),
  }
}

async function wikipediaGet(url: string, config: any) {
  try {
    return await axios.get(url, config)
  } catch (error: any) {
    if (error?.response?.status === 429) {
      await sleep(800)
      return axios.get(url, config)
    }
    throw error
  }
}

async function wikipediaSummary(query: string, lang = 'es') {
  const q = String(query || '').trim().slice(0, 200)
  if (!q) throw new Error('Falta el tema de Wikipedia.')
  const code = /^[a-z]{2,3}$/i.test(String(lang || '')) ? String(lang).toLowerCase() : 'es'
  const base = `https://${code}.wikipedia.org`
  let hits: any[] = []

  try {
    const search = await wikipediaGet(`${base}/w/api.php`, {
      params: {
        action: 'query',
        list: 'search',
        srsearch: q,
        srlimit: 3,
        format: 'json',
        utf8: 1,
      },
      headers: WIKI_HEADERS,
      timeout: 15_000,
    })
    hits = search.data?.query?.search || []
  } catch {}

  if (!hits.length) {
    try {
      const search = await wikipediaGet(`${base}/w/rest.php/v1/search/page`, {
        params: { q, limit: 3 },
        headers: WIKI_HEADERS,
        timeout: 15_000,
      })
      hits = (search.data?.pages || []).map((page: any) => ({
        title: String(page.title || ''),
        snippet: stripHtml(String(page.excerpt || '')),
      }))
    } catch {}
  }

  if (!hits.length) {
    try {
      const direct = await wikipediaGet(
        `${base}/api/rest_v1/page/summary/${encodeURIComponent(q)}`,
        { headers: WIKI_HEADERS, timeout: 15_000 }
      )
      return {
        title: direct.data?.title || q,
        description: direct.data?.description || '',
        extract: direct.data?.extract || '',
        url:
          direct.data?.content_urls?.desktop?.page ||
          `${base}/wiki/${encodeURIComponent(q)}`,
      }
    } catch {}
    return { query: q, results: [] }
  }

  const title = String(hits[0].title)
  try {
    const summary = await wikipediaGet(
      `${base}/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      { headers: WIKI_HEADERS, timeout: 15_000 }
    )
    return {
      title: summary.data?.title || title,
      description: summary.data?.description || '',
      extract: summary.data?.extract || '',
      url:
        summary.data?.content_urls?.desktop?.page ||
        `${base}/wiki/${encodeURIComponent(title)}`,
      related: hits.slice(0, 3).map((hit: any) => String(hit.title)),
    }
  } catch {
    return {
      title,
      extract: cleanText(String(hits[0].snippet || '')),
      url: `${base}/wiki/${encodeURIComponent(title)}`,
      related: hits.slice(0, 3).map((hit: any) => String(hit.title)),
    }
  }
}

async function weather(city: string) {
  const place = String(city || '').trim().slice(0, 120)
  if (!place) throw new Error('Falta la ciudad.')
  const response = await axios.get(`https://wttr.in/${encodeURIComponent(place)}`, {
    params: { format: 'j1', lang: 'es' },
    headers: BROWSER_HEADERS,
    timeout: 20_000,
  })
  const data = response.data
  const current = data?.current_condition?.[0]
  if (!current) throw new Error('No encontré el clima de ese lugar.')
  const area = data?.nearest_area?.[0]
  return {
    city: area?.areaName?.[0]?.value || place,
    country: area?.country?.[0]?.value || '',
    temperatureC: current.temp_C,
    feelsLikeC: current.FeelsLikeC,
    humidity: current.humidity,
    description:
      current.lang_es?.[0]?.value || current.weatherDesc?.[0]?.value || '',
    windKph: current.windspeedKmph,
    observationTime: current.observation_time,
  }
}

function currentTime(timezone?: string) {
  const zone = String(timezone || botConfig.timezone)
  try {
    return {
      timezone: zone,
      human: new Intl.DateTimeFormat('es-ES', {
        timeZone: zone,
        dateStyle: 'full',
        timeStyle: 'long',
      }).format(new Date()),
      iso: new Date().toISOString(),
    }
  } catch {
    throw new Error('La zona horaria no es válida.')
  }
}

export async function executeTool(name: string, args: any = {}) {
  const input = args && typeof args === 'object' ? args : {}
  switch (name) {
    case 'search':
      return searchWeb(input.query, input.limit)
    case 'read_url':
      return readUrl(input.url)
    case 'wikipedia':
      return wikipediaSummary(input.query, input.lang)
    case 'weather':
      return weather(input.city)
    case 'time':
      return currentTime(input.timezone)
    default:
      throw new Error(`Herramienta no permitida: ${name || 'desconocida'}`)
  }
}

function toolSummary(name: string, args: any) {
  const value = args?.query ?? args?.url ?? args?.city ?? args?.timezone ?? ''
  if (!value) return 'Ejecutando herramienta...'
  return String(value).slice(0, 300)
}

function toolResult(value: any) {
  const text = JSON.stringify(value) ?? String(value)
  return text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}…` : text
}

function resultSummary(value: any) {
  if (value?.error) return String(value.error).slice(0, 300)
  if (value?.note) return String(value.note).slice(0, 300)
  if (Array.isArray(value?.results)) return `${value.results.length} resultado(s).`
  if (value?.extract) return String(value.extract).slice(0, 300)
  if (value?.text) return String(value.text).slice(0, 300)
  if (value?.human) return String(value.human)
  return 'Herramienta completada.'
}

function systemPrompt(context?: string) {
  let today = ''
  try {
    today = new Intl.DateTimeFormat('es-ES', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: botConfig.timezone,
    }).format(new Date())
  } catch {}

  return [
    `Eres ${botConfig.botName}, un asistente útil, directo y conversacional.`,
    'Responde en español, con claridad y sin inventar información.',
    'Puedes usar las herramientas disponibles para buscar en la web, leer URLs públicas, consultar Wikipedia, el clima y la hora.',
    'Cuando uses una herramienta, basa la respuesta en sus resultados y menciona la fuente o el enlace cuando aporte valor.',
    'No tienes acceso a archivos locales, terminal, código, comandos del bot ni servicios internos.',
    'No ejecutes código ni intentes obtener claves, sesiones o datos privados.',
    'Si no puedes verificar algo, dilo con honestidad.',
    today ? `Fecha y hora actual: ${today}.` : '',
    context ? `Contexto del chat:\n${context}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

async function requestModel(messages: ChatMessage[], tools: boolean) {
  if (!botConfig.ai.key) {
    throw new Error('Falta configurar OPENROUTER_API_KEY en el archivo .env.')
  }

  const body: any = {
    model: botConfig.ai.model,
    messages,
    temperature: 0.7,
    max_tokens: Math.min(8_192, Math.max(256, Number(botConfig.ai.maxTokens) || 2_048)),
  }
  if (tools) {
    body.tools = AI_TOOLS
    body.tool_choice = 'auto'
  }

  try {
    const response = await axios.post(botConfig.ai.url, body, {
      headers: {
        Authorization: `Bearer ${botConfig.ai.key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': botConfig.link || 'https://github.com/Neveloopp',
        'X-Title': botConfig.botName,
      },
      timeout: 90_000,
    })
    return response.data
  } catch (error: any) {
    const message =
      error?.response?.data?.error?.message ||
      error?.response?.data?.message ||
      error?.message ||
      'Error de conexión con OpenRouter.'
    throw new Error(String(message))
  }
}

export async function askAI({
  prompt,
  context,
  onStep,
  callModel = requestModel,
}: {
  prompt: string
  context?: string
  onStep?: (step: AIStep) => Promise<void> | void
  callModel?: ModelCaller
}) {
  const question = String(prompt || '').trim().slice(0, MAX_PROMPT_CHARS)
  if (!question) throw new Error('La pregunta está vacía.')

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt(context) },
    { role: 'user', content: question },
  ]
  const maxRounds = Math.min(8, Math.max(0, Number(botConfig.ai.maxToolRounds) || 4))

  for (let round = 0; round <= maxRounds; round++) {
    const allowTools = round < maxRounds
    const data = await callModel(messages, allowTools)
    const choice = data?.choices?.[0]?.message
    if (!choice) throw new Error('OpenRouter no devolvió una respuesta válida.')

    const reasoning = String(choice.reasoning || choice.reasoning_content || '').trim()
    if (reasoning) {
      await onStep?.({
        title: 'Razonamiento del modelo',
        body: reasoning.slice(0, 800),
        reasoning: true,
      })
    }

    const calls = Array.isArray(choice.tool_calls) ? choice.tool_calls : []
    if (allowTools && calls.length) {
      const plan = String(choice.content || '').trim()
      if (plan) {
        await onStep?.({
          title: 'Plan del modelo',
          body: plan.slice(0, 800),
          reasoning: true,
        })
      }

      messages.push({
        role: 'assistant',
        content: choice.content ?? null,
        tool_calls: calls,
      })

      for (const call of calls) {
        const name = String(call?.function?.name || '')
        let args: any = {}
        try {
          args = JSON.parse(String(call?.function?.arguments || '{}'))
        } catch {
          args = {}
        }

        await onStep?.({
          title: `Herramienta: ${name || 'desconocida'}`,
          body: toolSummary(name, args),
          reasoning: true,
        })

        let result: any
        try {
          result = await executeTool(name, args)
        } catch (error: any) {
          result = { error: String(error?.message || error) }
        }

        await onStep?.({
          title: `Resultado: ${name || 'herramienta'}`,
          body: resultSummary(result),
        })

        messages.push({
          role: 'tool',
          tool_call_id: String(call?.id || ''),
          name,
          content: toolResult(result),
        })
      }
      continue
    }

    const content = String(choice.content || '').trim()
    if (content) return content
    if (!allowTools) throw new Error('La IA no generó una respuesta.')
  }

  throw new Error('La IA no terminó dentro del límite de herramientas.')
}

export function splitMessage(value: string, max = 3_500) {
  const text = String(value || '').trim()
  if (!text) return []
  const size = Math.max(500, Number(max) || 3_500)
  const chunks: string[] = []
  let rest = text

  while (rest.length > size) {
    let cut = rest.lastIndexOf('\n', size)
    if (cut < size * 0.6) cut = rest.lastIndexOf(' ', size)
    if (cut <= 0) cut = size
    chunks.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  if (rest) chunks.push(rest)
  return chunks
}
