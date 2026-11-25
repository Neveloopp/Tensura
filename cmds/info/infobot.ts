/*
 * Información general del bot.
 */
import botConfig from '../../settings.ts'
import { commands } from '../../core/system/comandos.ts'
import { formatMs } from '../../core/utils.ts'

export default {
  command: ['infobot', 'botinfo', 'info'],
  category: 'info',
  description: 'Muestra la información general de Tensura.',
  example: ['#infobot'],
  async run({ m, settings }: any) {
    const text = [
      `╭─〔 ${botConfig.botName.toUpperCase()} 〕`,
      `│ ฅ^•ﻌ•^ฅ Un bot ligero para grupos, descargas y stickers.`,
      '│',
      `│ ➛ Nombre: ${settings.namebot || botConfig.botName}`,
      `│ ➛ Versión: ${botConfig.version}`,
      `│ ➛ Owner: ${settings.owner || botConfig.owner[0] || '—'}`,
      `│ ➛ Prefijos: ${Array.isArray(settings.prefijo) ? settings.prefijo.join(' ') : botConfig.prefixes.join(' ')}`,
      `│ ➛ Comandos: ${commands.filter(command => !command.hidden).length}`,
      `│ ➛ Uptime: ${formatMs(process.uptime() * 1000)}`,
      `│ ➛ Stickers con audio: hasta ${botConfig.sticker.audioMaxSeconds}s`,
      `│ ➛ Descargas: hasta ${Math.round(botConfig.download.maxBytes / 1024 / 1024)} MB`,
      '╰────────────',
      botConfig.link ? `\n> ${botConfig.link}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    return m.reply(text)
  },
}
