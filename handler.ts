/*
 * ╭──────────────────────────────────────────────╮
 * │  TENSURA · handler.ts                        │
 * │  Prefijos, permisos, antienlaces y ejecución.│
 * ╰──────────────────────────────────────────────╯
 */
import chalk from 'chalk'
import moment from 'moment-timezone'
import botConfig from './settings.ts'
import {
  getChat,
  getSettings,
  getUser,
  updateChat,
  updateUser,
  updateSettings,
} from './core/system/database.ts'
import {
  getCachedGroupMeta,
  isJidAdminInGroup,
  isLink,
  jidNumber,
  normalizeJid,
} from './core/utils.ts'
import { addWarning } from './core/group.ts'

function permissionText(type: string, command: string) {
  const messages: Record<string, string> = {
    owner: `ꕥ El comando *${command}* solo puede usarlo mi Creador.`,
    admin: `ꕥ El comando *${command}* solo puede usarlo un Administrador del grupo.`,
    botAdmin: `ꕥ Necesito ser Administrador del grupo para ejecutar *${command}*.`,
    group: `ꕥ El comando *${command}* solo funciona dentro de un grupo.`,
    private: `ꕥ El comando *${command}* solo funciona en privado.`,
  }
  return messages[type] || botConfig.messages.error
}

async function enforceAntiLink(sock: any, m: any, botId: string) {
  if (!m.isGroup) return
  const chat = getChat(m.chat)
  if (!chat.moderation?.antiLinks) return
  if (!isLink(m.text)) return

  const senderIsAdmin = await isJidAdminInGroup(sock, m.chat, m.sender).catch(() => false)
  if (senderIsAdmin) return

  const botIsAdmin = await isJidAdminInGroup(sock, m.chat, botId).catch(() => false)
  if (!botIsAdmin) return

  await sock.sendMessage(m.chat, { delete: m.key }).catch(() => null)
  const result = await addWarning(sock, m, m.sender, 'Enlace no permitido')

  const text = result.kicked
    ? `(x_x) @${jidNumber(m.sender)} alcanzó ${result.limit} advertencias y fue retirado del grupo.`
    : `(>_<) @${jidNumber(m.sender)}, los enlaces no están permitidos en este grupo.\nAdvertencia: ${result.count}/${result.limit}`

  await sock
    .sendMessage(m.chat, { text, mentions: [m.sender] }, { quoted: m.raw })
    .catch(() => null)
}

export default async function handler(sock: any, m: any) {
  if (!m?.message) return
  m.__start = Date.now()
  const botId = normalizeJid(sock?.user?.id || '')
  if (!botId) return

  const botSettings = getSettings(botId)
  const prefixConfig = botSettings.prefijo ?? botConfig.prefixes
  const prefixes: string[] = Array.isArray(prefixConfig)
    ? prefixConfig
    : typeof prefixConfig === 'string'
      ? [prefixConfig]
      : []

  const body = String(m.text || '').trim()
  if (!body) return

  const subbot = sock?.__subbot
  const ownerNumbers = new Set(
    [...botConfig.owner, subbot?.managerPhone, subbot?.botId]
      .map(number => jidNumber(number))
      .filter(Boolean)
  )
  const isOwner = ownerNumbers.has(jidNumber(m.sender)) || m.sender === botId

  if (botSettings.antiprivado && !m.isGroup && !isOwner) return

  const prefix = prefixes.find(item => item && body.startsWith(item)) || ''
  const raw = prefix ? body.slice(prefix.length).trim() : body
  const [commandPart, ...args] = raw.split(/\s+/)
  const command = String(commandPart || '').toLowerCase()
  const text = args.join(' ')

  if (m.fromMe && (m.isGroup || !prefix)) return

  const noPrefixHelp = !prefix && ['menu', 'help', 'allmenu'].includes(command)
  const cmdData = global.comandos.get(command)

  if (!prefix && !noPrefixHelp) {
    await enforceAntiLink(sock, m, botId)
    return
  }

  if (!cmdData) {
    if (!prefix) return
    void Promise.resolve(sock.readMessages?.([m.key])).catch(() => null)
    return m
      .reply(
        `ꕤ El comando *${command}* no existe.\n✎ Usa *${prefix}help* para ver la lista de comandos.`
      )
      .catch(() => null)
  }

  const metadata = m.isGroup ? await getCachedGroupMeta(sock, m.chat) : null
  const groupTitle = metadata?.subject || ''
  const chat = getChat(m.chat, groupTitle)
  if (m.isGroup && groupTitle && chat.title !== groupTitle) {
    updateChat(m.chat, 'title', groupTitle)
  }

  const isAdmin = m.isGroup
    ? await isJidAdminInGroup(sock, m.chat, m.sender).catch(() => false)
    : false
  const isBotAdmin = m.isGroup
    ? await isJidAdminInGroup(sock, m.chat, botId).catch(() => false)
    : false
  const canAdmin = isAdmin || isOwner

  if (cmdData.groupOnly && !m.isGroup) {
    return m.reply(permissionText('group', command)).catch(() => null)
  }
  if (cmdData.privateOnly && m.isGroup) {
    return m.reply(permissionText('private', command)).catch(() => null)
  }
  if (cmdData.isOwner && !isOwner) {
    return m.reply(permissionText('owner', command)).catch(() => null)
  }
  if (cmdData.isAdmin && !canAdmin) {
    return m.reply(permissionText('admin', command)).catch(() => null)
  }
  if (cmdData.botAdmin && !isBotAdmin) {
    return m.reply(permissionText('botAdmin', command)).catch(() => null)
  }

  const now = moment().tz(botConfig.timezone)
  const time = now.format('DD/MM/YY HH:mm:ss')
  console.log(
    [
      '',
      chalk.bold.blue('***********************************'),
      chalk.bold.yellow(`│ Fecha: ${chalk.whiteBright(time)}`),
      chalk.bold.cyanBright(`│ Usuario: ${chalk.whiteBright(m.pushName || jidNumber(m.sender))}`),
      chalk.bold.magentaBright(`│ Remitente: ${chalk.whiteBright(m.sender)}`),
      m.isGroup
        ? chalk.bold.greenBright(`│ Grupo: ${chalk.whiteBright(groupTitle || m.chat)}`)
        : chalk.bold.greenBright('│ Chat privado'),
      chalk.bold.blue('***********************************'),
    ].join('\n')
  )

  try {
    const user = getUser(m.sender)
    user.name = m.pushName || user.name || ''
    user.usedcommands = Number(user.usedcommands || 0) + 1
    updateUser(m.sender, 'name', user.name)
    updateUser(m.sender, 'usedcommands', user.usedcommands)

    const today = now.format('YYYY-MM-DD')
    if (!chat.stats) chat.stats = {}
    if (!chat.stats[today]) chat.stats[today] = { msgs: 0, cmds: 0 }
    chat.stats[today].cmds += 1
    updateChat(m.chat, 'stats', chat.stats)

    botSettings.commandsejecut = Number(botSettings.commandsejecut || 0) + 1
    updateSettings(botId, 'commandsejecut', botSettings.commandsejecut)

    void Promise.resolve(sock.readMessages?.([m.key])).catch(() => null)
    void Promise.resolve(sock.sendPresenceUpdate?.('composing', m.chat)).catch(() => null)

    await cmdData.run({
      sock,
      m,
      args,
      command,
      text,
      prefix,
      usedPrefix: prefix,
      settings: botSettings,
      group: chat,
      metadata,
      isAdmin: canAdmin,
      isBotAdmin,
      isOwner,
    })
  } catch (error: any) {
    const message = String(error?.message || error || 'Error desconocido')
    console.log(chalk.red(`[cmd:${command}]`), message)
    await m.reply(`(x_x) ${message}`).catch(() => null)
  }
}
