/*
 * Eval de JavaScript para el Creador.
 */
import util from 'util'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

export default {
  command: ['e', 'eval'],
  category: 'owner',
  description: 'Evalúa código JavaScript en el contexto del bot.',
  usage: '<código>',
  example: ['#e 2 + 2', '#e sock.user.id', '#eval await m.reply("ok")'],
  isOwner: true,
  async run({
    sock,
    m,
    args,
    text,
    rawText,
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
    const code = String(rawText || args.join(' ')).trim()
    if (!code) return m.reply(`Uso: ${usedPrefix || prefix || '#'}${command} <código>`)
    try {
      let result: any
      try {
        result = await eval(`(async () => { return (${code}) })()`)
      } catch {
        try {
          result = await eval(`(async () => { ${code} })()`)
        } catch {
          result = eval(code)
        }
      }
      if (result === undefined) return m.reply('undefined')
      const output =
        typeof result === 'string'
          ? result
          : util.inspect(result, {
              depth: null,
              maxArrayLength: null,
              maxStringLength: null,
              breakLength: 100,
              colors: false,
            })
      return m.reply(output)
    } catch (error: any) {
      return m.reply(String(error?.stack || error?.message || error))
    }
  },
}
