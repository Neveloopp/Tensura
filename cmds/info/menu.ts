/*
 * Menú principal y ayuda por comando.
 */
import botConfig from '../../settings.ts'
import { commands, getCategories, getCommandsByCategory } from '../../core/system/comandos.ts'
import { formatMs } from '../../core/utils.ts'

const CATEGORY_INFO: Record<string, { icon: string; label: string }> = {
  info: { icon: 'ℹ️', label: 'INFORMACIÓN' },
  grupo: { icon: '👥', label: 'GRUPOS' },
  dow: { icon: '📥', label: 'DESCARGAS' },
  sticker: { icon: '🎨', label: 'STICKERS' },
  otros: { icon: '🧩', label: 'OTROS' },
}

function categoryInfo(category: string) {
  return CATEGORY_INFO[category] || { icon: '📦', label: category.toUpperCase() }
}

function buildMenu(settings: any, pushName: string, prefix: string) {
  const visible = commands.filter(command => !command.hidden)
  const categories = getCategories()
  const uptime = formatMs(process.uptime() * 1000)

  const lines = [
    `╭─〔 ${botConfig.botName.toUpperCase()} 〕`,
    `│ ฅ^•ﻌ•^ฅ Hola, ${pushName || 'usuario'}`,
    '│',
    `│ ➛ Prefijo: ${prefix || '(sin prefijo)'}`,
    `│ ➛ Comandos: ${visible.length}`,
    `│ ➛ Uptime: ${uptime}`,
    `│ ➛ Owner: ${settings.owner || botConfig.owner[0] || '—'}`,
    '╰────────────',
    '',
  ]

  for (const category of categories) {
    const list = getCommandsByCategory(category)
    if (!list.length) continue
    const info = categoryInfo(category)
    lines.push(`╭─〔 ${info.icon} ${info.label} 〕`)
    for (const command of list) {
      const usage = command.usage ? ` ${command.usage}` : ''
      lines.push(`│ ✦ ${prefix}${command.name}${usage}`)
    }
    lines.push('╰────────────', '')
  }

  lines.push(
    `> ${botConfig.botName} · v${botConfig.version}`,
    botConfig.link ? `> ${botConfig.link}` : ''
  )

  return lines.filter(line => line !== '').join('\n')
}

function commandHelp(name: string, prefix: string) {
  const command = commands.find(item => item.name === name || item.aliases.includes(name))
  if (!command) return ''

  const lines = [
    `╭─〔 COMANDO: ${command.name} 〕`,
    `│ ${command.description}`,
    `│`,
    `│ ➛ Categoría: ${command.category}`,
    `│ ➛ Uso: ${prefix}${command.name}${command.usage ? ` ${command.usage}` : ''}`,
  ]

  if (command.aliases.length) lines.push(`│ ➛ Alias: ${command.aliases.join(', ')}`)
  if (command.isAdmin) lines.push('│ ➛ Solo administradores')
  if (command.botAdmin) lines.push('│ ➛ El bot debe ser administrador')
  if (command.groupOnly) lines.push('│ ➛ Solo grupos')
  if (command.example?.length) {
    lines.push('│', '│ Ejemplos:')
    for (const example of command.example.slice(0, 4)) lines.push(`│   ${example}`)
  }

  lines.push('╰────────────')
  return lines.join('\n')
}

export default {
  command: ['menu', 'help', 'allmenu', 'comandos'],
  category: 'info',
  description: 'Muestra el menú completo de Tensura o la ayuda de un comando.',
  usage: '[comando]',
  example: ['#menu', '#help sticker'],
  async run({ m, args, prefix, usedPrefix, settings }: any) {
    const activePrefix = prefix || usedPrefix || botConfig.prefixes[0]

    if (args[0]) {
      const help = commandHelp(String(args[0]).toLowerCase(), activePrefix)
      return m.reply(help || `ꕤ No encontré el comando *${args[0]}*.`)
    }

    const text = buildMenu(settings, m.pushName, activePrefix)

    if (settings.banner) {
      try {
        return await m.send({ image: { url: settings.banner }, caption: text })
      } catch {}
    }

    return m.reply(text)
  },
}
