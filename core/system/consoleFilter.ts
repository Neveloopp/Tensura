/*
 * libsignal escribe mucho ruido de sesiones en la consola.
 * Se silencia solo en log/info/debug para no ocultar errores reales.
 */
const SIGNAL_NOISE = [
  'Closing session:',
  'Opening session:',
  'Closing open session',
  'Closing stale open session',
  'Removing old closed session',
  'Session already closed',
  'Session already open',
  'Migrating session to:',
  'Duplicate PreKeyWhisperMessage',
  'SessionEntry {',
]

let installed = false

export function isSignalNoise(args: unknown[]): boolean {
  return args.some(arg => {
    if (typeof arg === 'string') {
      return SIGNAL_NOISE.some(pattern => arg.includes(pattern))
    }
    return typeof arg === 'object' && arg !== null && arg.constructor?.name === 'SessionEntry'
  })
}

export function installConsoleFilter() {
  if (installed) return
  if (process.env.TENSURA_VERBOSE || process.env.ULTRA_BAILEYS_VERBOSE) return
  installed = true

  for (const level of ['log', 'info', 'debug'] as const) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      if (isSignalNoise(args)) return
      original(...args)
    }
  }
}
