/*
 * Base de datos JSON simple y editable.
 * Se guarda en database/*.json y se puede abrir con
 * cualquier editor de texto.
 */
import fs from 'fs'
import path from 'path'
import botConfig from '../../settings.ts'

type Dict = Record<string, any>

const DB_DIR = path.resolve('database')
const FILES = {
  settings: path.join(DB_DIR, 'settings.json'),
  users: path.join(DB_DIR, 'users.json'),
  chats: path.join(DB_DIR, 'chats.json'),
  stickers: path.join(DB_DIR, 'stickers.json'),
}

const cache: Record<string, Dict> = {}
const pending = new Set<keyof typeof FILES>()
let persistTimer: NodeJS.Timeout | null = null
const PERSIST_DELAY = Math.max(50, Number(process.env.DB_PERSIST_MS || 250))

function ensureDir() {
  fs.mkdirSync(DB_DIR, { recursive: true })
}

function readFile(file: string): Dict {
  ensureDir()
  try {
    if (!fs.existsSync(file)) return {}
    const raw = fs.readFileSync(file, 'utf8').trim()
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveFile(file: string, data: Dict) {
  ensureDir()
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  fs.renameSync(tmp, file)
}

function table(name: keyof typeof FILES): Dict {
  if (!cache[name]) cache[name] = readFile(FILES[name])
  return cache[name]
}

export function flushDB() {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  if (!pending.size) return
  for (const name of pending) saveFile(FILES[name], table(name))
  pending.clear()
}

function persist(name: keyof typeof FILES) {
  pending.add(name)
  if (persistTimer) return
  persistTimer = setTimeout(flushDB, PERSIST_DELAY)
  persistTimer.unref?.()
}

const now = () => new Date().toISOString()

function defaultSettings(botId: string) {
  return {
    id: botId,
    namebot: botConfig.botName,
    namebot2: botConfig.botName2,
    owner: botConfig.owner[0] || '',
    link: botConfig.link,
    banner: botConfig.banner,
    idcanal: botConfig.channel.id,
    namecanal: botConfig.channel.name,
    prefijo: botConfig.prefixes,
    type: 'Owner',
    commandsejecut: 0,
    createdAt: now(),
  }
}

function defaultUser(jid: string) {
  return {
    id: jid,
    name: '',
    exp: 0,
    usedcommands: 0,
    metadatos: '',
    metadatos2: '',
    createdAt: now(),
  }
}

export const DEFAULT_WELCOME = 'Bienvenido, {nombre}, a {grupo}. Ya somos {miembros} miembros.'
export const DEFAULT_FAREWELL = '{nombre} salió de {grupo}.'

function defaultChat(jid: string, title = '') {
  return {
    id: jid,
    title,
    welcome: {
      enabled: false,
      message: DEFAULT_WELCOME,
    },
    farewell: {
      enabled: false,
      message: DEFAULT_FAREWELL,
    },
    rules: '',
    moderation: {
      antiLinks: false,
      warnLimit: 3,
    },
    schedule: {
      enabled: false,
      closeTime: '22:00',
      openTime: '08:00',
      timezone: botConfig.timezone,
      state: 'open',
    },
    warnings: {},
    stats: {},
    createdAt: now(),
  }
}

function defaultStickerMeta(jid: string) {
  return {
    id: jid,
    pack: botConfig.sticker.pack,
    author: botConfig.sticker.author,
    emojis: botConfig.sticker.emojis,
    createdAt: now(),
  }
}

function normalizeChat(chat: any, jid: string, title = '') {
  const base = defaultChat(jid, title)
  const out = chat && typeof chat === 'object' ? chat : {}
  out.id = jid
  out.title = out.title || title || ''
  out.welcome = { ...base.welcome, ...(out.welcome || {}) }
  out.farewell = { ...base.farewell, ...(out.farewell || {}) }
  out.rules = typeof out.rules === 'string' ? out.rules : ''
  out.moderation = { ...base.moderation, ...(out.moderation || {}) }
  out.moderation.warnLimit = Math.max(1, Math.min(10, Number(out.moderation.warnLimit || 3)))
  out.schedule = { ...base.schedule, ...(out.schedule || {}) }
  out.schedule.enabled = Boolean(out.schedule.enabled)
  out.schedule.timezone = out.schedule.timezone || botConfig.timezone
  out.schedule.state = ['open', 'closed'].includes(out.schedule.state) ? out.schedule.state : 'open'
  out.warnings = out.warnings && typeof out.warnings === 'object' ? out.warnings : {}
  out.stats = out.stats && typeof out.stats === 'object' ? out.stats : {}
  return out
}

// ── Settings del bot ─────────────────────────────────────────────
export function getSettings(botId: string) {
  const data = table('settings')
  if (!data[botId]) {
    data[botId] = defaultSettings(botId)
    persist('settings')
  }
  return data[botId]
}

export function updateSettings(botId: string, key: string, value: any) {
  const record = getSettings(botId)
  record[key] = value
  persist('settings')
  return record
}

// ── Usuarios ─────────────────────────────────────────────────────
export function getUser(jid: string) {
  const data = table('users')
  if (!data[jid]) {
    data[jid] = defaultUser(jid)
    persist('users')
  }
  return data[jid]
}

export function updateUser(jid: string, key: string, value: any) {
  const record = getUser(jid)
  record[key] = value
  persist('users')
  return record
}

export function allUsers() {
  return table('users')
}

// ── Chats / grupos ───────────────────────────────────────────────
export function getChat(jid: string, title = '') {
  const data = table('chats')
  if (!data[jid]) {
    data[jid] = defaultChat(jid, title)
    persist('chats')
  } else {
    data[jid] = normalizeChat(data[jid], jid, title)
  }
  if (title && data[jid].title !== title) {
    data[jid].title = title
    persist('chats')
  }
  return data[jid]
}

export function updateChat(jid: string, keyOrUpdater: any, value?: any, title = '') {
  const record = getChat(jid, title)
  if (typeof keyOrUpdater === 'function') {
    const result = keyOrUpdater(record) || record
    table('chats')[jid] = result
  } else {
    record[keyOrUpdater] = value
  }
  persist('chats')
  return table('chats')[jid]
}

export const getGroup = getChat

export function updateGroup(jid: string, keyOrUpdater: any, value?: any, title = '') {
  return updateChat(jid, keyOrUpdater, value, title)
}

export function allChats() {
  return table('chats')
}

// ── Metadatos de stickers ────────────────────────────────────────
export function getStickerMeta(jid: string) {
  const data = table('stickers')
  if (!data[jid]) {
    data[jid] = defaultStickerMeta(jid)
    persist('stickers')
  }
  return data[jid]
}

export function updateStickerMeta(jid: string, key: string, value: any) {
  const record = getStickerMeta(jid)
  record[key] = value
  persist('stickers')
  return record
}

export function deletedb() {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  pending.clear()
  for (const key of Object.keys(cache)) delete cache[key]
  for (const file of Object.values(FILES)) {
    try {
      fs.rmSync(file, { force: true })
    } catch {}
  }
}

export function initDB() {
  ensureDir()
  for (const name of Object.keys(FILES) as (keyof typeof FILES)[]) table(name)
  for (const name of Object.keys(FILES) as (keyof typeof FILES)[]) {
    if (!fs.existsSync(FILES[name])) saveFile(FILES[name], table(name))
  }

  global.db = {
    getSettings,
    updateSettings,
    getUser,
    updateUser,
    getChat,
    updateChat,
    getGroup,
    updateGroup,
    getStickerMeta,
    updateStickerMeta,
    allUsers,
    allChats,
    deletedb,
    flushDB,
  }
  global.getSettings = getSettings
  global.updateSettings = updateSettings
  global.getUser = getUser
  global.updateUser = updateUser
  global.getChat = getChat
  global.updateChat = updateChat
  global.getGroup = getGroup
  global.updateGroup = updateGroup
  global.getStickerMeta = getStickerMeta
  global.updateStickerMeta = updateStickerMeta
  global.allUsers = allUsers
  global.allChats = allChats
  global.flushDB = flushDB

  return global.db
}

process.once('exit', flushDB)
