/*
 * Solicitudes para entrar al grupo.
 */
import { getTarget } from '../../core/group.ts'
import { jidNumber, normalizeJid } from '../../core/utils.ts'

export default {
  command: ['approve', 'reject', 'aceptar', 'rechazar', 'pending', 'solicitudes'],
  category: 'grupo',
  description: 'Aprueba, rechaza o lista solicitudes de entrada.',
  usage: '[@usuario | número | list]',
  groupOnly: true,
  isAdmin: true,
  botAdmin: true,
  example: ['#pending', '#approve @usuario', '#reject @usuario'],
  async run({ sock, m, args, command }: any) {
    const isList = ['pending', 'solicitudes'].includes(command)
    const target = isList ? null : await getTarget(sock, m, args)

    if (!target?.jid) {
      const list = await sock.groupRequestParticipantsList(m.chat).catch(() => [])
      if (!list?.length) return m.reply('ꕤ No hay solicitudes pendientes.')

      const lines = ['╭─〔 📨 SOLICITUDES PENDIENTES 〕']
      for (const item of list.slice(0, 30)) {
        const jid = normalizeJid(item?.jid || item?.id || item?.participant || '')
        if (jid) lines.push(`│ ✦ @${jidNumber(jid)}`)
      }
      lines.push('│', '│ Usa: approve @usuario | reject @usuario', '╰────────────')

      return sock.sendMessage(
        m.chat,
        {
          text: lines.join('\n'),
          mentions: list
            .map((item: any) => normalizeJid(item?.jid || item?.id || item?.participant || ''))
            .filter(Boolean),
        },
        { quoted: m.raw }
      )
    }

    const action = ['approve', 'aceptar'].includes(command) ? 'approve' : 'reject'
    await sock.groupRequestParticipantsUpdate(m.chat, [target.jid], action)

    return m.reply(
      `${action === 'approve' ? '✅' : '❌'} @${jidNumber(target.jid)} ${
        action === 'approve' ? 'fue aceptado' : 'fue rechazado'
      } en el grupo.`
    )
  },
}
