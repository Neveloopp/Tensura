/*
 * Configuración compartida para publicar en el canal.
 * Stch y texch usan el mismo destino y grupo permitido.
 */
import botConfig from '../settings.ts'

export type ChannelConfig = {
  enabled: boolean
  channel: string
  group: string
  pack: string
  author: string
  maxSeconds: number
}

export function parseDestination(value: string, fallbackServer: string): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const invite = raw.match(/whatsapp\.com\/channel\/([A-Za-z0-9]+)/i)
  if (invite) return `${invite[1]}@newsletter`
  if (/@(newsletter|g\.us|s\.whatsapp\.net)$/i.test(raw)) return raw
  const digits = raw.replace(/\D/g, '')
  return digits ? `${digits}${fallbackServer}` : ''
}

function defaults(settings: any): ChannelConfig {
  return {
    enabled: true,
    channel: parseDestination(settings?.idcanal || botConfig.channel.id || '', '@newsletter'),
    group: '',
    pack: botConfig.sticker.pack,
    author: botConfig.sticker.author,
    maxSeconds: botConfig.sticker.audioMaxSeconds,
  }
}

export function getChannelConfig(settings: any): ChannelConfig {
  const base = defaults(settings)
  const saved = settings?.stch && typeof settings.stch === 'object' ? settings.stch : {}
  const maxSeconds = Number(saved.maxSeconds ?? base.maxSeconds)

  return {
    enabled: saved.enabled !== false,
    channel: String(saved.channel ?? base.channel ?? '').trim(),
    group: String(saved.group ?? '').trim(),
    pack: String(saved.pack || base.pack),
    author: String(saved.author || base.author),
    maxSeconds: Math.max(1, Math.min(60, Number.isFinite(maxSeconds) ? maxSeconds : base.maxSeconds)),
  }
}

export function channelAccessError(
  m: any,
  config: ChannelConfig,
  isOwner: boolean,
  label: string
): string {
  if (!isOwner && !m.isGroup) {
    return `(>_<) ${label} solo funciona en el grupo configurado.`
  }
  if (!isOwner && !config.group) {
    return '(>_<) El Creador debe configurar el grupo permitido con: stch --config group <jid>.'
  }
  if (config.group && m.chat !== config.group) {
    return `(>_<) ${label} solo está permitido en el grupo configurado.`
  }
  return ''
}
