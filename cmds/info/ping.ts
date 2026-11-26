/*
 * Latencia real de WhatsApp y diagnóstico de recursos.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { monitorEventLoopDelay } from 'perf_hooks'
import { formatMs } from '../../core/utils.ts'
import { downloadTasks, normalTasks, stickerTasks } from '../../core/system/limiter.ts'

const SAMPLE_MS = 250
const NETWORK_TIMEOUT_MS = 3000
const CGROUP_ROOT = process.env.TENSURA_CGROUP_ROOT || '/sys/fs/cgroup'

function number(value: number, decimals = 1) {
  return Number.isFinite(value) ? value.toFixed(decimals) : '—'
}

function megabytes(bytes: number) {
  return bytes / 1024 / 1024
}

function gigabytes(bytes: number) {
  return bytes / 1024 / 1024 / 1024
}

function coreLabel(cores: number) {
  return cores === 1 ? 'núcleo' : 'núcleos'
}

function shortQueue(name: string) {
  if (name === 'descargas') return 'dow'
  if (name === 'stickers') return 'stk'
  return 'cmd'
}

function readText(filePath: string) {
  try {
    return fs.readFileSync(filePath, 'utf8').trim()
  } catch {
    return ''
  }
}

function cgroupRoots() {
  const roots = [CGROUP_ROOT]
  const line = readText('/proc/self/cgroup')
    .split('\n')
    .find(value => value.startsWith('0::'))
  const relative = line?.slice(3).replace(/^\/+/, '') || ''
  if (relative) roots.push(path.join(CGROUP_ROOT, relative))
  return roots
}

function cgroupValue(names: string[]) {
  for (const root of cgroupRoots()) {
    for (const name of names) {
      const value = readText(path.join(root, name))
      if (value) return value
    }
  }
  return ''
}

function finiteNumber(value: string) {
  const number = Number(value)
  return value && Number.isFinite(number) && number > 0 ? number : null
}

function memoryLimit(value: string) {
  const limit = finiteNumber(value)
  return limit && limit < 1e15 ? limit : null
}

function containerLimits() {
  const memoryUsed = finiteNumber(cgroupValue(['memory.current', 'memory/memory.usage_in_bytes']))
  const memoryMax = memoryLimit(cgroupValue(['memory.max', 'memory/memory.limit_in_bytes']))
  let cpuCores: number | null = null
  const cpuMax = cgroupValue(['cpu.max']).split(/\s+/)
  if (cpuMax[0] && cpuMax[0] !== 'max' && Number(cpuMax[1]) > 0) {
    cpuCores = Number(cpuMax[0]) / Number(cpuMax[1])
  } else {
    const quota = finiteNumber(cgroupValue(['cpu/cpu.cfs_quota_us']))
    const period = finiteNumber(cgroupValue(['cpu/cpu.cfs_period_us']))
    if (quota && period) cpuCores = quota / period
  }
  return { memoryUsed, memoryLimit: memoryMax, cpuCores }
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
    const container = containerLimits()
    const effectiveCores = Math.max(0.1, Math.min(cores, container.cpuCores || cores))
    const deviceCpuPct = metrics.cpuPct / effectiveCores
    const hasContainerMemory = Boolean(container.memoryUsed && container.memoryLimit)
    const containerMemoryPct =
      hasContainerMemory && container.memoryUsed && container.memoryLimit
        ? (container.memoryUsed / container.memoryLimit) * 100
        : 0
    const memoryPct = hasContainerMemory ? containerMemoryPct : total ? (used / total) * 100 : 0
    const memoryBase = hasContainerMemory
      ? Number(container.memoryLimit)
      : total || 0
    const botMemoryPct = memoryBase ? (memory.rss / memoryBase) * 100 : 0
    const queues = [normalTasks.stats, downloadTasks.stats, stickerTasks.stats]
    const busyQueues = queues.filter(queue => queue.pending >= queue.maxQueue)
    const waitingQueues = queues.filter(
      queue => queue.active >= queue.limit && queue.pending >= Math.max(1, Math.floor(queue.maxQueue / 2))
    )

    const problems: string[] = []
    if (net.error) problems.push('WhatsApp sin respuesta')
    if (metrics.p99 >= 250) problems.push('event loop bloqueado')
    if (deviceCpuPct >= 85) problems.push('CPU del bot alta')
    if (memoryPct >= 90) {
      problems.push(hasContainerMemory ? 'RAM del contenedor al límite' : 'RAM del sistema al límite')
    }
    if (net.rtt !== null && net.rtt >= 1500) problems.push('red lenta')
    if (busyQueues.length) {
      problems.push(
        ...busyQueues.map(
          queue => `cola de ${queue.name} llena (${queue.active}/${queue.limit} + ${queue.pending})`
        )
      )
    } else if (waitingQueues.length) {
      problems.push(
        ...waitingQueues.map(
          queue => `cola de ${queue.name} con espera (${queue.active}/${queue.limit} + ${queue.pending})`
        )
      )
    }

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
        `│ ➛ CPU bot: ${number(metrics.cpuPct)}% (${
          container.cpuCores
            ? `${number(deviceCpuPct)}% de ${number(effectiveCores, 2)} ${coreLabel(effectiveCores)}`
            : `${number(deviceCpuPct)}% del equipo`
        })`,
        `│ ➛ Carga host: ${number(load, 2)} · ${cores} ${coreLabel(cores)}`,
        `│ ➛ RAM bot: ${number(megabytes(memory.rss))} MB (${number(botMemoryPct)}% ${
          hasContainerMemory ? 'del contenedor' : 'del sistema'
        })`,
        `│ ➛ Heap: ${number(megabytes(memory.heapUsed))}/${number(megabytes(memory.heapTotal))} MB`,
        hasContainerMemory
          ? `│ ➛ RAM contenedor: ${number(megabytes(Number(container.memoryUsed)))}/${number(
              megabytes(Number(container.memoryLimit))
            )} MB (${number(containerMemoryPct, 0)}%) · host ${number(
              gigabytes(used)
            )}/${number(gigabytes(total))} GB`
          : `│ ➛ RAM sistema: ${number(gigabytes(used))}/${number(gigabytes(total))} GB (${number(
              memoryPct,
              0
            )}%)`,
        `│ ➛ Colas: ${queues
          .map(
            queue => `${shortQueue(queue.name)} ${queue.active}/${queue.limit}+${queue.pending}`
          )
          .join(' · ')}`,
        `│ ➛ Socket: ${socketState(sock)}`,
        `│ ➛ Uptime: ${formatMs(process.uptime() * 1000)}`,
        `│ ➛ Diagnóstico: ${problems.length ? problems.join('; ') : 'sin saturación evidente'}`,
        '╰────────────',
      ].join('\n')
    )
  },
}
