/*
 * Eval rápido de expresiones para el Creador.
 */
import { inspect } from 'util'

export default {
  command: ['r'],
  category: 'owner',
  description: 'Evalúa una expresión JavaScript y devuelve el resultado.',
  usage: '<expresión>',
  example: ['#r sock.user.id', '#r m.chat'],
  isOwner: true,
  async run({
    sock,
    m,
    args,
    text,
    command,
    prefix,
    usedPrefix,
    settings,
    group,
    metadata,
    isAdmin,
    isBotAdmin,
    isOwner,
  }: any) {
    const conn = sock
    if (!args.length) return m.reply(`Uso: ${usedPrefix || prefix || '#'}${command} <expresión>`)

    const code = args.join(' ')
    try {
      let result: any
      try {
        result = await eval(`(async () => { return ${code} })()`)
      } catch {
        result = await eval(code)
      }

      const output =
        result === undefined
          ? 'undefined'
          : typeof result === 'object'
            ? inspect(result, { depth: 4 })
            : String(result)
      return m.reply(output)
    } catch (error: any) {
      return m.reply(String(error?.stack || error?.message || error))
    }
  },
}
