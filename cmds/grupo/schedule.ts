/*
 * Horario automático de apertura y cierre.
 */
import { getChat, updateChat } from '../../core/system/database.ts'

function validTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''))
}

function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date())
    return true
  } catch {
    return false
  }
}

function status(chat: any) {
  const schedule = chat.schedule
  return [
    '╭─〔 ⏰ HORARIO AUTOMÁTICO 〕',
    `│ ➛ Estado: ${schedule.enabled ? 'activado' : 'desactivado'}`,
    `│ ➛ Cierra: ${schedule.closeTime}`,
    `│ ➛ Abre: ${schedule.openTime}`,
    `│ ➛ Zona: ${schedule.timezone}`,
    `│ ➛ Estado actual: ${schedule.state === 'closed' ? 'cerrado' : 'abierto'}`,
    '│',
    '│ Usa: schedule on | off | set HH:MM HH:MM | timezone <zona>',
    '╰────────────',
  ].join('\n')
}

export default {
  command: ['schedule', 'horario'],
  category: 'grupo',
  description: 'Programa el cierre y la apertura automática del grupo.',
  usage: 'on | off | set <cierre> <apertura> | timezone <zona>',
  groupOnly: true,
  isAdmin: true,
  example: ['#schedule on', '#schedule set 22:00 08:00', '#schedule timezone America/Havana'],
  async run({ m, args }: any) {
    const chat = getChat(m.chat)
    const sub = String(args[0] || '').toLowerCase()

    if (!sub || sub === 'status') return m.reply(status(chat))

    if (sub === 'on' || sub === 'off') {
      updateChat(m.chat, 'schedule', { ...chat.schedule, enabled: sub === 'on' })
      return m.reply(`(＾▽＾) Horario ${sub === 'on' ? 'activado' : 'desactivado'}.\n\n${status(getChat(m.chat))}`)
    }

    if (sub === 'set') {
      const closeTime = String(args[1] || '')
      const openTime = String(args[2] || '')
      if (!validTime(closeTime) || !validTime(openTime)) {
        return m.reply('(>_<) Usa el formato 24h: schedule set 22:00 08:00')
      }
      if (closeTime === openTime) {
        return m.reply('(>_<) La hora de cierre y apertura no pueden ser iguales.')
      }
      updateChat(m.chat, 'schedule', { ...chat.schedule, closeTime, openTime })
      return m.reply(`(＾▽＾) Horario actualizado.\n\n${status(getChat(m.chat))}`)
    }

    if (sub === 'timezone' || sub === 'zona') {
      const timezone = String(args[1] || '')
      if (!timezone || !validTimezone(timezone)) {
        return m.reply('(>_<) Zona horaria inválida. Ejemplo: America/Havana')
      }
      updateChat(m.chat, 'schedule', { ...chat.schedule, timezone })
      return m.reply(`(＾▽＾) Zona horaria: ${timezone}`)
    }

    return m.reply('ꕤ Usa: schedule on | off | set HH:MM HH:MM | timezone <zona>')
  },
}
