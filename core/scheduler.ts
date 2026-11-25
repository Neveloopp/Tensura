/*
 * Horario automático de grupos (cerrar/abrir).
 * Se revisa cada 30 segundos y se apoya en la zona
 * horaria configurada en database/chats.json.
 */
import { allChats, updateChat } from './system/database.ts'

function minutesOf(value: string): number | null {
  const match = String(value || '').match(/^(\d{2}):(\d{2})$/)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

function nowMinutes(timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || 'America/Havana',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())
  const map: Record<string, string> = {}
  for (const part of parts) map[part.type] = part.value
  return Number(map.hour) * 60 + Number(map.minute)
}

function shouldClose(schedule: any): boolean {
  const close = minutesOf(schedule?.closeTime)
  const open = minutesOf(schedule?.openTime)
  if (close === null || open === null || close === open) return false
  const now = nowMinutes(schedule?.timezone)
  if (close < open) return now >= close && now < open
  return now >= close || now < open
}

async function tick(sock: any) {
  const chats = allChats()
  for (const [jid, chat] of Object.entries(chats)) {
    const schedule: any = (chat as any)?.schedule
    if (!jid.endsWith('@g.us') || !schedule?.enabled) continue

    const desired = shouldClose(schedule) ? 'closed' : 'open'
    if (schedule.state === desired) continue

    try {
      await sock.groupSettingUpdate(jid, desired === 'closed' ? 'announcement' : 'not_announcement')
      updateChat(jid, current => {
        current.schedule.state = desired
        return current
      })
    } catch {}
  }
}

export function startGroupScheduler(sock: any) {
  void tick(sock)
  const timer = setInterval(() => void tick(sock), 30000)
  timer.unref?.()
  return timer
}
