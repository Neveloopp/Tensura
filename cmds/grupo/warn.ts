/*
 * Sistema de advertencias.
 */
import { getChat, updateChat } from '../../core/system/database.ts'
import { addWarning, getTarget, removeWarning, warningList } from '../../core/group.ts'
import { isJidAdminInGroup, jidNumber } from '../../core/utils.ts'

function renderWarnings(m: any, target: string) {
  const chat = getChat(m.chat)
  const state = warningList(chat, target)
  const lines = [
    `╭─〔 ⚠️ ADVERTENCIAS · @${jidNumber(target)} 〕`,
    `│ ➛ Total: ${state.count}/${state.limit}`,
  ]

  if (!state.entries.length) {
    lines.push('│', '│ ✦ Sin advertencias registradas.')
  } else {
    state.entries.slice(-5).forEach((entry: any, index: number) => {
      const date = new Date(entry.at).toLocaleDateString('es-ES')
      lines.push(`│ ${index + 1}. ${entry.reason} · ${date}`)
    })
  }

  lines.push('╰────────────')
  return lines.join('\n')
}

export default {
  command: ['warn', 'warnings', 'unwarn', 'warnlimit'],
  category: 'grupo',
  description: 'Advierte, consulta o elimina advertencias de un miembro.',
  usage: '<motivo> | warnings [@usuario] | unwarn [@usuario] | warnlimit <1-10>',
  groupOnly: true,
  example: ['#warn spam', '#warnings @usuario', '#unwarn @usuario', '#warnlimit 3'],
  async run({ sock, m, args, command, isAdmin }: any) {
    const chat = getChat(m.chat)

    if (command === 'warnlimit') {
      if (!isAdmin) return m.reply('ꕥ Solo un administrador puede cambiar el límite.')
      const value = Number(args[0])
      if (!Number.isFinite(value) || value < 1 || value > 10) {
        return m.reply(`ꕤ El límite actual es *${chat.moderation.warnLimit}*.\nUsa: warnlimit <1-10>`)
      }
      updateChat(m.chat, 'moderation', { ...chat.moderation, warnLimit: Math.round(value) })
      return m.reply(`(＾▽＾) Límite de advertencias: *${Math.round(value)}*.`)
    }

    if (command === 'warnings') {
      const target = (await getTarget(sock, m, args))?.jid || m.sender
      return m.reply(renderWarnings(m, target))
    }

    const target = await getTarget(sock, m, args)
    if (!target?.jid) {
      return m.reply('(>_<) Menciona, responde o escribe el número del miembro.')
    }

    if (command === 'unwarn') {
      if (!isAdmin) return m.reply('ꕥ Solo un administrador puede quitar advertencias.')
      const all = args.some(arg => ['all', 'todo', 'todas'].includes(String(arg).toLowerCase()))
      const count = await removeWarning(m, target.jid, all)
      return m.reply(`(＾▽＾) Advertencias de @${jidNumber(target.jid)}: *${count}/${chat.moderation.warnLimit}*.`)
    }

    if (!isAdmin) return m.reply('ꕥ Solo un administrador puede advertir.')

    const reason = args
      .filter(arg => !String(arg).includes(jidNumber(target.jid)))
      .join(' ')
      .trim()

    const result = await addWarning(sock, m, target.jid, reason || 'Sin motivo indicado')

    if (result.kicked) {
      return m.reply(
        `(x_x) @${jidNumber(target.jid)} alcanzó ${result.limit} advertencias y fue expulsado.`
      )
    }

    return m.reply(
      `⚠️ @${jidNumber(target.jid)} recibió una advertencia.\n` +
        `➛ Motivo: ${reason || 'Sin motivo indicado'}\n` +
        `➛ Total: ${result.count}/${result.limit}`
    )
  },
}
