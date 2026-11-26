/*
 * Latencia real de WhatsApp y diagnóstico de recursos.
 */
import os from 'os'
import { monitorEventLoopDelay } from 'perf_hooks'
import { formatMs } from '../../core/utils.ts'

const SAMPLE_MS = 250
const NETWORK_TIMEOUT_MS = 3000

function number(value: number, decimals = 1) {
  return Number.isFinite(value) ? value.toFixed(decimals) : '—'
}

function megabytes(bytes: number) {
  return bytes / 1024 / 1024
}

function socketState(sock: any) {
  try {
    if (sock?.ws?.isOpen) return 'conectado'
    if (sock?.ws?.isClosed) return 'cerrado'
    if (sock?.ws?.isConnecting) return 'conectando'
    if (sock?.ws?.isClosing) return 'cerrando'
  } catch {}
  return 'desconocido'
}

export default {
  command: ['ping', 'p'],
  category: 'info',
  description: 'Mide la latencia real de WhatsApp y muestra CPU, RAM y event loop.',
  example: ['#ping'],
  async run({ sock, m }: any) {
    const processing = Math.max(0, Date.now() - Number(m.__start || Date.now()))
    const loop = monitorEventLoopDelay({ resolution: 10 })
    const cpuStart = process.cpuUsage()
    const sampleStart = performance.now()
    const open = Boolean(sock?.ws?.isOpen)

    loop.enable()

    const network = (async () => {
      if (!open) return { rtt: null as number | null, error: 'socket cerrado' }
      const started = performance.now()
      try {
        await sock.query(
          {
            tag: 'iq',
            attrs: { to: '@s.whatsapp.net', type: 'get', xmlns: 'w:p' },
            content: [{ tag: 'ping', attrs: {} }],
          },
          NETWORK_TIMEOUT_MS
        )
        return { rtt: performance.now() - started, error: '' }
      } catch (error: any) {
        const message = String(error?.message || error || 'sin respuesta')
        return {
          rtt: null,
          error: message.includes('Timed Out') ? `timeout ${NETWORK_TIMEOUT_MS} ms` : message,
        }
      }
    })()

    const sample = (async () => {
      await new Promise(resolve => setTimeout(resolve, SAMPLE_MS))
      loop.disable()
      const elapsed = Math.max(1, performance.now() - sampleStart)
      const cpu = process.cpuUsage(cpuStart)
      let mean = 0
      let p99 = 0
      try {
        mean = loop.mean / 1e6
        p99 = loop.percentile(99) / 1e6
      } catch {}
      return {
        elapsed,
        cpuPct: ((cpu.user + cpu.system) / 1000 / elapsed) * 100,
        mean,
        p99,
      }
    })()

    const [net, metrics] = await Promise.all([network, sample])

    const memory = process.memoryUsage()
    const total = os.totalmem()
    const free = os.freemem()
    const used = Math.max(0, total - free)
    const cores =
      typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length || 1
    const load = os.loadavg()[0] || 0
    const loadPerCore = load / Math.max(1, cores)
    const memoryPct = total ? (used / total) * 100 : 0
    const botMemoryPct = total ? (memory.rss / total) * 100 : 0
    const deviceCpuPct = metrics.cpuPct / Math.max(1, cores)

    const problems: string[] = []
    if (net.error) problems.push('WhatsApp sin respuesta')
    if (metrics.p99 >= 250) problems.push('event loop bloqueado')
    if (deviceCpuPct >= 80) problems.push('CPU del bot alta')
    if (memoryPct >= 92) problems.push('RAM del sistema al límite')
    if (loadPerCore >= 2) problems.push('carga del sistema alta')
    if (net.rtt !== null && net.rtt >= 1500) problems.push('red lenta')

    const rtt =
      net.rtt === null
        ? `sin respuesta (${String(net.error).slice(0, 70)})`
        : `${Math.round(net.rtt)} ms`

    return m.reply(
      [
        '╭─〔 🏓 PONG REAL 〕',
        `│ ➛ RTT WhatsApp: ${rtt}`,
        `│ ➛ Procesamiento: ${Math.round(processing)} ms`,
        `│ ➛ Event loop: ${number(metrics.mean)} ms prom · ${number(metrics.p99)} p99`,
        `│ ➛ CPU bot: ${number(metrics.cpuPct)}% (${number(deviceCpuPct)}% del equipo)`,
        `│ ➛ Carga: ${number(load, 2)} · ${cores} núcleos`,
        `│ ➛ RAM bot: ${number(megabytes(memory.rss))} MB (${number(botMemoryPct)}% del sistema)`,
        `│ ➛ Heap: ${number(megabytes(memory.heapUsed))}/${number(megabytes(memory.heapTotal))} MB`,
        `│ ➛ RAM sistema: ${number(used / 1024 / 1024 / 1024)}/${number(total / 1024 / 1024 / 1024)} GB (${number(memoryPct, 0)}%)`,
        `│ ➛ Socket: ${socketState(sock)}`,
        `│ ➛ Uptime: ${formatMs(process.uptime() * 1000)}`,
        `│ ➛ Diagnóstico: ${problems.length ? problems.join('; ') : 'sin saturación evidente'}`,
        '╰────────────',
      ].join('\n')
    )
  },
}
