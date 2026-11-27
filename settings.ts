/*
 * ╭──────────────────────────────────────────────╮
 * │  TENSURA · settings.ts                       │
 * │  Todo lo editable del bot vive aquí.         │
 * ╰──────────────────────────────────────────────╯
 *
 * No hace falta tocar el resto del código para
 * cambiar nombre, dueño, prefijos, APIs, stickers
 * o los textos de error.
 */
import 'dotenv/config'

const env = process.env

const list = (value: string | undefined, fallback: string[] = []) => {
  const items = String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
  return items.length ? items : fallback
}

const number = (value: string | undefined, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export const settings = {
  botName: env.BOT_NAME || 'Tensura',
  botName2: env.BOT_NAME2 || 'Tensura MD',
  version: '1.0.0',
  owner: list(env.OWNER_NUMBER, ['50585117242']),
  sessionName: env.SESSION_NAME || 'Sessions/Tensura',
  prefixes: list(env.PREFIXES, ['#', '/', '.', '!']),
  link: env.BOT_LINK || 'https://github.com/Neveloopp',
  banner: env.BANNER_URL || '',
  channel: {
    id: env.CHANNEL_ID || '',
    name: env.CHANNEL_NAME || 'Tensura',
  },
  timezone: env.TIMEZONE || 'America/Havana',
  connection: {
    method: (env.WA_CONNECTION_METHOD || 'qr').toLowerCase(),
    phone: env.WA_PHONE_NUMBER || '',
  },
  sticker: {
    pack: env.STICKER_PACK || 'Tensura',
    author: env.STICKER_AUTHOR || 'Tensura Bot',
    emojis: ['✨'],
    audioMaxSeconds: number(env.STICKER_AUDIO_MAX, 25),
  },
  download: {
    maxBytes: number(env.DOWNLOAD_MAX_MB, 100) * 1024 * 1024,
    photoMaxBytes: 9 * 1024 * 1024,
  },
  api: {
    evogb: {
      url: 'https://api.evogb.org',
      key: env.EVOGB_API_KEY || '',
    },
    raylais: {
      url: 'https://app.raylais.cc.cd',
      key: env.RAYLAIS_API_KEY || '',
    },
    lempi: {
      url: 'https://api.lempi.lat',
      key: env.LEMPI_API_KEY || '',
    },
  },
  ai: {
    key: env.OPENROUTER_API_KEY || '',
    url: env.OPENROUTER_URL || 'https://openrouter.ai/api/v1/chat/completions',
    model: env.OPENROUTER_MODEL || 'deepseek/deepseek-chat-v3-0324:free',
    maxTokens: number(env.OPENROUTER_MAX_TOKENS, 2048),
    maxToolRounds: number(env.OPENROUTER_MAX_TOOL_ROUNDS, 4),
  },
  messages: {
    owner: 'ꕥ Este comando solo puede usarlo mi Creador.',
    admin: 'ꕥ Este comando solo puede usarlo un Administrador del grupo.',
    botAdmin: 'ꕥ Necesito ser Administrador del grupo para hacer eso.',
    group: 'ꕥ Este comando solo funciona dentro de un grupo.',
    private: 'ꕥ Este comando solo funciona en privado.',
    wait: 'ꕥ Un momento...',
    error: 'ꕥ Ocurrió un error inesperado. Inténtalo de nuevo.',
  },
}

// Compatibilidad con el estilo de comandos de Megumin/Viko
;(global as any).owner = settings.owner
;(global as any).msgglobal = settings.messages.error
;(global as any).mess = settings.messages
;(global as any).botSettings = settings

export default settings
