/*
 * ╭──────────────────────────────────────────────╮
 * │  TENSURA · index.ts                          │
 * │  Conexión, arranque y eventos de WhatsApp.   │
 * ╰──────────────────────────────────────────────╯
 */
import './settings.ts'
import fs from 'fs'
import path from 'path'
import readline from 'readline'
import {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidDecode,
  makeCacheableSignalKeyStore,
  makeWASocket,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys'
import pino from 'pino'
import qrcode from 'qrcode-terminal'
import chalk from 'chalk'
import cfonts from 'cfonts'
import boxen from 'boxen'
import botConfig from './settings.ts'
import handler from './handler.ts'
import groupEvents from './cmds/events.ts'
import seeCommands from './core/system/commandLoader.ts'
import { flushDB, getSettings, initDB, updateSettings } from './core/system/database.ts'
import { smsg } from './core/message.ts'
import { rememberAudioSticker } from './core/messageCache.ts'
import { claimIncoming, shouldProcessIncoming } from './core/incoming.ts'
import { startGroupScheduler } from './core/scheduler.ts'
import { patchAudioStickerProtocol } from './core/audioSticker.ts'
import { setBeforeRestart, startProjectWatcher } from './core/system/sync.ts'
import { subBotManager } from './core/subbots/manager.ts'
import { invalidateMainGroups, rememberMainGroup, syncMainGroups } from './core/subbots/mainGroups.ts'
import { startSubBotWebServer } from './core/web/server.ts'
import { invalidateGroupMeta, normalizeJid } from './core/utils.ts'
import { installConsoleFilter } from './core/system/consoleFilter.ts'

let useCode = false
let phoneNumber = ''
let starting = false
let schedulerTimer: any = null
let webServer: Awaited<ReturnType<typeof startSubBotWebServer>> | null = null
let servicesStopped = false

async function stopServices() {
  if (servicesStopped) return
  servicesStopped = true
  try {
    flushDB()
  } catch {}
  await Promise.race([
    Promise.allSettled([webServer?.stop(), subBotManager.shutdown()]),
    new Promise(resolve => setTimeout(resolve, 1800)),
  ])
}

const sessionDir = path.resolve(botConfig.sessionName)
const logger = pino({ level: 'silent' })

function banner() {
  console.clear()
  cfonts.say('TENSURA', {
    font: 'block',
    align: 'center',
    gradient: ['cyan', 'blue'],
    independentGradient: true,
    transitionGradient: true,
  })
  cfonts.say('B O T  ·  M D', {
    font: 'console',
    align: 'center',
    gradient: ['magenta', 'cyan'],
  })
  console.log(
    boxen(chalk.italic.white('Versión recortada de Viko · grupos, descargas y stickers'), {
      padding: 1,
      margin: { top: 0, bottom: 1, left: 2, right: 2 },
      borderStyle: 'round',
      borderColor: 'cyan',
      textAlignment: 'center',
    })
  )
}

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close()
      resolve(String(answer || '').trim())
    })
  })
}

function normalizePhone(input: string) {
  const digits = String(input || '').replace(/\D/g, '')
  if (digits.length < 7 || digits.length > 15) {
    throw new Error('Indica el número con código de país, solo dígitos (7 a 15).')
  }
  return digits
}

async function askPhone() {
  while (true) {
    try {
      const number = normalizePhone(await ask(chalk.bold.magentaBright('  ➜  Número con código de país: ')))
      if (number) return number
    } catch (error: any) {
      console.log(chalk.yellow(`  ${error?.message || error}`))
    }
  }
}

function cleanupIncompleteSession() {
  const credsFile = path.join(sessionDir, 'creds.json')
  if (!fs.existsSync(credsFile)) return false

  try {
    const creds = JSON.parse(fs.readFileSync(credsFile, 'utf8'))
    if (creds?.registered) return false

    console.log(chalk.yellow('Vinculación anterior sin terminar. Eliminando la sesión para generar un vínculo nuevo...'))
    fs.rmSync(sessionDir, { recursive: true, force: true })
    return true
  } catch (error: any) {
    console.log(chalk.yellow(`Sesión incompleta o dañada. Eliminándola: ${error?.message || error}`))
    fs.rmSync(sessionDir, { recursive: true, force: true })
    return true
  }
}

function hasRegisteredSession() {
  const credsFile = path.join(sessionDir, 'creds.json')
  if (!fs.existsSync(credsFile)) return false

  try {
    return Boolean(JSON.parse(fs.readFileSync(credsFile, 'utf8'))?.registered)
  } catch {
    return false
  }
}

async function connectionOptions() {
  const method = String(process.env.WA_CONNECTION_METHOD || '').trim().toLowerCase()
  const phone = String(process.env.WA_PHONE_NUMBER || '').trim()
  const hasSession = hasRegisteredSession()

  if (hasSession) return { code: false, phone: '' }
  if (method === 'qr') return { code: false, phone: '' }

  if (method === 'code') {
    let number = ''
    try {
      number = normalizePhone(phone)
    } catch {
      number = ''
    }
    if (!number) {
      banner()
      number = await askPhone()
    }
    return { code: true, phone: number }
  }

  banner()
  console.log(
    boxen(
      chalk.bold.yellowBright('¿CÓMO DESEA CONECTARSE?\n\n') +
        chalk.cyanBright('1') + chalk.white('  →  Código QR\n') +
        chalk.cyanBright('2') + chalk.white('  →  Código de 8 dígitos'),
      {
        padding: 1,
        margin: 1,
        borderStyle: 'double',
        borderColor: 'cyan',
        title: 'TENSURA · VINCULACIÓN',
        titleAlignment: 'center',
      }
    )
  )

  const option = await ask(chalk.bold.magentaBright('  ➜  Opción (1/2): '))
  const code = option === '2'
  const number = code ? await askPhone() : ''
  return { code, phone: number }
}

async function startBot() {
  if (starting) return
  starting = true

  try {
    fs.mkdirSync(sessionDir, { recursive: true })
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir)
    const { version } = await fetchLatestBaileysVersion()
    const registered = Boolean(state.creds.registered)
    let pairingTimer: any = null

    const sock: any = makeWASocket({
      version,
      logger,
      printQRInTerminal: false,
      browser: Browsers.ubuntu('Chrome'),
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
      getMessage: async () => undefined,
    } as any)

    ;(global as any).sock = sock
    patchAudioStickerProtocol()

    sock.ev.on('creds.update', saveCreds)

    if (useCode && !registered && phoneNumber) {
      pairingTimer = setTimeout(async () => {
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          if ((global as any).sock !== sock || sock.user?.id) return

          try {
            const code = await sock.requestPairingCode(phoneNumber)
            if ((global as any).sock !== sock) return

            const pretty = String(code || '').match(/.{1,4}/g)?.join('-') || code
            console.log(chalk.bgMagenta.white.bold('\n  CÓDIGO DE VINCULACIÓN  '), chalk.bold.white(pretty), '\n')
            console.log(
              chalk.gray(
                '  WhatsApp → Dispositivos vinculados → Vincular con número de teléfono.\n' +
                  '  El código anterior ya no sirve si reinicias el bot.\n'
              )
            )
            return
          } catch (error: any) {
            console.log(
              chalk.yellow(`  No pude generar el código (${attempt}/3): ${error?.message || error}`)
            )
            if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 5000))
          }
        }

        console.log(chalk.red('No se pudo generar el código de vinculación. Reinicia Tensura e inténtalo otra vez.'))
      }, 2000)
    }

    sock.ev.on('connection.update', async update => {
      const { qr, connection, lastDisconnect } = update

      if (qr && !useCode) {
        console.log(
          boxen(chalk.cyan.bold('ESCANEA ESTE CÓDIGO QR'), {
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'cyan',
            textAlignment: 'center',
          })
        )
        qrcode.generate(qr, { small: true })
      }

      if (connection === 'open') {
        starting = false
        if (pairingTimer) {
          clearTimeout(pairingTimer)
          pairingTimer = null
        }
        const botId = normalizeJid(sock.user?.id || '')
        const settings = getSettings(botId)
        updateSettings(botId, 'type', 'Owner')

        if (schedulerTimer) clearInterval(schedulerTimer)
        schedulerTimer = startGroupScheduler(sock)
        void syncMainGroups(true)

        console.log(
          boxen(
            chalk.bold.greenBright(`✔ Conectado: ${sock.user?.name || sock.user?.id || 'Tensura'}`) +
              '\n' +
              chalk.gray(`Prefijos: ${settings.prefijo?.join(' ') || botConfig.prefixes.join(' ')}`),
            {
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'green',
              textAlignment: 'center',
            }
          )
        )
      }

      if (connection === 'close') {
        starting = false
        if (pairingTimer) {
          clearTimeout(pairingTimer)
          pairingTimer = null
        }
        if (schedulerTimer) {
          clearInterval(schedulerTimer)
          schedulerTimer = null
        }

        const error = lastDisconnect?.error as any
        const reason = Number(
          error?.output?.statusCode || error?.output?.payload?.statusCode || error?.statusCode || 0
        )
        const pairingFailed = !registered && useCode && [401, 403, 405, 411, 428].includes(reason)

        if (pairingFailed) {
          console.log(chalk.red('\nWhatsApp rechazó la vinculación. Se eliminó la sesión incompleta; vuelve a iniciar Tensura para generar un código nuevo.'))
          try {
            fs.rmSync(sessionDir, { recursive: true, force: true })
          } catch {}
          process.exit(1)
        }

        if ([DisconnectReason.loggedOut, DisconnectReason.forbidden, DisconnectReason.badSession].includes(reason)) {
          console.log(chalk.red('Sesión cerrada o inválida. Borra la carpeta de sesión y vuelve a vincular.'))
          process.exit(1)
        }

        if (reason === DisconnectReason.connectionReplaced) {
          console.log(chalk.yellow('Otra sesión reemplazó a Tensura. Cierra la otra sesión primero.'))
          return
        }

        console.log(chalk.yellow('Conexión perdida. Reconectando en 3 segundos...'))
        setTimeout(() => void startBot(), 3000)
      }
    })

    sock.ev.on('messages.upsert', ({ messages, type }: any) => {
      if (type !== 'notify') return

      for (const raw of messages || []) {
        rememberAudioSticker(raw)
        if (!shouldProcessIncoming(sock, raw)) continue
        if (!claimIncoming(raw)) continue
        void (async () => {
          try {
            if (!raw?.message) return
            const chat = normalizeJid(raw.key?.remoteJid)
            if (chat.endsWith('@g.us')) rememberMainGroup(chat)
            const m = await smsg(sock, raw)
            await handler(sock, m)
          } catch (error: any) {
            console.log(chalk.gray(`[mensaje] ${error?.message || error}`))
          }
        })()
      }
    })

    sock.ev.on('group-participants.update', async (update: any) => {
      invalidateGroupMeta(update?.id)
      invalidateMainGroups()
      void syncMainGroups(true)
      try {
        await groupEvents(sock, update)
      } catch (error: any) {
        console.log(chalk.gray(`[grupo] ${error?.message || error}`))
      }
    })

    sock.ev.on('groups.upsert', () => {
      invalidateMainGroups()
      void syncMainGroups(true)
    })

    sock.ev.on('groups.update', (updates: any) => {
      for (const update of Array.isArray(updates) ? updates : [updates]) {
        invalidateGroupMeta(update?.id)
      }
      invalidateMainGroups()
      void syncMainGroups(true)
    })

    sock.sendText = (jid: string, text: string, quoted: any = '', options: any = {}) =>
      sock.sendMessage(jid, { text, ...options }, { quoted })

    sock.decodeJid = (jid: string) => {
      if (!jid) return jid
      if (/:\d+@/gi.test(jid)) {
        const decoded = jidDecode(jid) || ({} as any)
        return decoded.user && decoded.server ? `${decoded.user}@${decoded.server}` : jid
      }
      return jid
    }
  } catch (error: any) {
    starting = false
    console.log(chalk.red('Error iniciando Tensura:'), error?.message || error)
    setTimeout(() => void startBot(), 5000)
  }
}

installConsoleFilter()

;(async () => {
  banner()
  initDB()
  cleanupIncompleteSession()
  const commandsPromise = seeCommands()

  const options = await connectionOptions()
  useCode = options.code
  phoneNumber = options.phone

  const total = await commandsPromise
  console.log(chalk.gray(`[cmds] ${total} comandos cargados.`))
  setBeforeRestart(stopServices)
  startProjectWatcher()

  try {
    await subBotManager.init()
    ;(global as any).subbotManager = subBotManager
    void subBotManager.startAll()
  } catch (error: any) {
    console.log(chalk.red('[subbots] No se pudo iniciar:'), error?.message || error)
  }

  if (/^(1|true|yes|on)$/i.test(String(process.env.SUBBOT_WEB_ENABLED || ''))) {
    const rawPort = Number(process.env.SUBBOT_WEB_PORT || 3000)
    const port = Number.isInteger(rawPort) && rawPort > 0 ? rawPort : 3000
    const host = String(process.env.SUBBOT_WEB_HOST || '0.0.0.0')
    const ownerPhone = String(process.env.SUBBOT_WEB_PHONE || '')
    const ownerPassword = String(process.env.SUBBOT_WEB_PASSWORD || '')
    try {
      webServer = await startSubBotWebServer({
        manager: subBotManager,
        host,
        port,
        ownerPhone,
        ownerPassword,
      })
      console.log(chalk.cyan(`[web] Panel disponible en http://${host}:${port}`))
    } catch (error: any) {
      console.log(chalk.red('[web] No se pudo iniciar el panel:'), error?.message || error)
    }
  }

  await startBot()
})()

let shuttingDown = false
const shutdown = async () => {
  if (shuttingDown) return
  shuttingDown = true
  try {
    await stopServices()
  } finally {
    process.exit(0)
  }
}

process.once('SIGINT', () => void shutdown())
process.once('SIGTERM', () => void shutdown())

process.on('uncaughtException', error => {
  const message = String((error as any)?.message || error || '')
  if (/rate-overlimit|timed out|Connection Closed|ECONNRESET/i.test(message)) return
  console.log(chalk.red('[uncaughtException]'), message)
})

process.on('unhandledRejection', reason => {
  const message = String((reason as any)?.message || reason || '')
  if (/rate-overlimit|timed out|Connection Closed|ECONNRESET/i.test(message)) return
  console.log(chalk.red('[unhandledRejection]'), message)
})
