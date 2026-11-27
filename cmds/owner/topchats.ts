import { getActivity, topChats } from '../../core/system/database.ts'
import { jidNumber } from '../../core/utils.ts'

export default {
  command: ['topchats', 'chatrank', 'ranking'],
  category: 'owner',
  description: 'Muestra los chats donde más se usa este bot.',
  usage: '[cantidad]',
  example: ['#topchats', '#topchats 15'],
  isOwner: true,
  async run({ m, args, settings }: any) {
    const botId = String(settings?.id || '').trim()
    const limit = Math.max(1, Math.min(20, Number(args?.[0]) || 10))
    const rows = topChats(botId, limit)
    const record = getActivity(botId)
    const chats = Object.values(record.chats || {}) as any[]
    const totalChats = chats.length
    const totalScore = chats.reduce((sum, item) => sum + (Number(item?.score) || 0), 0)

    if (!rows.length) {
      return m.reply('(>_<) Aún no hay actividad registrada para este bot.')
    }

    const lines = [
      '╭─〔 TOP CHATS · ACTIVIDAD 〕',
      `│ ➛ Bot: ${settings?.namebot || jidNumber(botId) || botId}`,
      `│ ➛ Chats registrados: ${totalChats}`,
      `│ ➛ Score total: ${totalScore}`,
      '│',
      ...rows.map((row, index) =>
        [
          `│ ${index + 1}. ${row.name}`,
          `│    ${row.id}`,
          `│    ${row.type === 'private' ? 'Privado' : 'Grupo'} · ${row.score} pts`,
        ].join('\n')
      ),
      '╰────────────',
    ]

    return m.reply(lines.join('\n'))
  },
}
