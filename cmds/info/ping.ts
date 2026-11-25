/*
 * Latencia, uptime y uso de memoria.
 */
import os from 'os'
import { formatMs } from '../../core/utils.ts'

export default {
  command: ['ping', 'p'],
  category: 'info',
  description: 'Mide la latencia del bot y muestra su estado.',
  example: ['#ping'],
  async run({ m }: any) {
    const latency = Math.max(0, Date.now() - Number(m.__start || Date.now()))
    const memory = process.memoryUsage().rss
    const total = os.totalmem()
    const used = total - os.freemem()

    return m.reply(
      [
        '╭─〔 🏓 PONG 〕',
        `│ ➛ Latencia: ${latency} ms`,
        `│ ➛ Uptime: ${formatMs(process.uptime() * 1000)}`,
        `│ ➛ RAM bot: ${(memory / 1024 / 1024).toFixed(1)} MB`,
        `│ ➛ RAM sistema: ${(used / 1024 / 1024 / 1024).toFixed(1)} GB / ${(total / 1024 / 1024 / 1024).toFixed(1)} GB`,
        `│ ➛ Plataforma: ${os.platform()} ${os.arch()}`,
        '╰────────────',
      ].join('\n')
    )
  },
}
