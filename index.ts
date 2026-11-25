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
import { startGroupScheduler } from './core/scheduler.ts'
import { patchAudioStickerProtocol } from './core/audioSticker.ts'
import { normalizeJid } from './core/utils.ts'

let useCode = false
let phoneNumber = ''
let starting = false
let schedulerTimer: any = null

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
  let digits = String(input || '').replace(/\D/g, '')
  if (digits.startsWith('0')) digits = digits.replace(/^0+/, '')
  if (digits.length === 10 && digits.startsWith('3')) digits = `57${digits}`
  if (digits.startsWith('52') && !digits.startsWith('521') && digits.length >= 12) {
    digits = `521${digits.slice(2)}`
  }
  if (digits.startsWith('54') && !digits.startsWith('549') && digits.length >= 11) {
    digits = `549${digits.slice(2)}`
  }
  return digits
}

async function connectionOptions() {
  const method = String(process.env.WA_CONNECTION_METHOD || '').trim().toLowerCase()
  const phone = String(process.env.WA_PHONE_NUMBER || '').trim()
  const hasSession = fs.existsSync(path.join(sessionDir, 'creds.json'))

  if (hasSession) return { code: false, phone: '' }
  if (method === 'qr') return { code: false, phone: '' }

  if (method === 'code') {
    let number = normalizePhone(phone)
    if (!number) {
      banner()
      number = normalizePhone(await ask(chalk.bold.magentaBright('  ➜  Número con código de país: ')))
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
  const number = code
    ? normalizePhone(await ask(chalk.bold.magentaBright('  ➜  Número con código de país: ')))
    : ''
  return { code, phone: number }
}

async function startBot() {
  if (starting) return
  starting = true

  try {
    fs.mkdirSync(sessionDir, { recursive: true })
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir)
    const { version } = await fetchLatestBaileysVersion()

    const sock: any = makeWASocket({
      version,
      logger,
      printQRInTerminal: false,
      browser: Browsers.macOS('Desktop'),
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: true,
      syncFullHistory: false,
      getMessage: async () => undefined,
      keepAliveIntervalMs: 45000,
    } as any)

    ;(global as any).sock = sock
    patchAudioStickerProtocol()

    sock.ev.on('creds.update', saveCreds)

    if (useCode && !state.creds.registered && phoneNumber) {
      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(phoneNumber, 'TENSURA1')
          const pretty = String(code || '').match(/.{1,4}/g)?.join('-') || code
          console.log(chalk.bgMagenta.white.bold('\n  CÓDIGO DE VINCULACIÓN  '), chalk.bold.white(pretty), '\n')
        } catch (error: any) {
          console.log(chalk.red('No pude generar el código:'), error?.message || error)
        }
      }, 3000)
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
        const botId = normalizeJid(sock.user?.id || '')
        const settings = getSettings(botId)
        updateSettings(botId, 'type', 'Owner')

        if (schedulerTimer) clearInterval(schedulerTimer)
        schedulerTimer = startGroupScheduler(sock)

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
        if (schedulerTimer) {
          clearInterval(schedulerTimer)
          schedulerTimer = null
        }
        const reason = (lastDisconnect?.error as any)?.output?.statusCode

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

    sock.ev.on('messages.upsert', async ({ messages, type }: any) => {
      if (type !== 'notify') return

      for (const raw of messages) {
        try {
          if (!raw?.message) continue
          if (raw.key?.remoteJid === 'status@broadcast') continue
          if (String(raw.key?.id || '').startsWith('BAE5') && String(raw.key?.id || '').length === 16) continue
          const m = await smsg(sock, raw)
          await handler(sock, m)
        } catch (error: any) {
          console.log(chalk.gray(`[mensaje] ${error?.message || error}`))
        }
      }
    })

    sock.ev.on('group-participants.update', async (update: any) => {
      try {
        await groupEvents(sock, update)
      } catch (error: any) {
        console.log(chalk.gray(`[grupo] ${error?.message || error}`))
      }
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

;(async () => {
  banner()
  initDB()
  const commandsPromise = seeCommands()

  const options = await connectionOptions()
  useCode = options.code
  phoneNumber = options.phone

  const total = await commandsPromise
  console.log(chalk.gray(`[cmds] ${total} comandos cargados.`))

  await startBot()
})()

const shutdown = () => {
  try {
    flushDB()
  } finally {
    process.exit(0)
  }
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)

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
