import { isGroupJid, normalizeJid } from '../utils.ts'

const SYNC_TTL = 30_000
const RETRY_TTL = 10_000

let groups = new Set<string>()
let lastSync = 0
let lastAttempt = 0
let syncing: Promise<void> | null = null

function mainSock() {
  return (global as any)?.sock
}

export function rememberMainGroup(groupJid: string) {
  const jid = normalizeJid(groupJid)
  if (isGroupJid(jid)) groups.add(jid)
}

export function invalidateMainGroups() {
  groups = new Set()
  lastSync = 0
  lastAttempt = 0
}

export async function syncMainGroups(force = false): Promise<void> {
  const sock = mainSock()
  if (!sock?.user?.id || typeof sock.groupFetchAllParticipating !== 'function') return

  const now = Date.now()
  if (!force) {
    if (now - lastSync < SYNC_TTL) return
    if (now - lastAttempt < RETRY_TTL) return
  }
  if (syncing) return syncing

  lastAttempt = now
  syncing = (async () => {
    try {
      const data = await sock.groupFetchAllParticipating()
      const next = new Set<string>()
      for (const jid of Object.keys(data || {})) {
        const normalized = normalizeJid(jid)
        if (isGroupJid(normalized)) next.add(normalized)
      }
      groups = next
      lastSync = Date.now()
    } catch {
    } finally {
      syncing = null
    }
  })()
  return syncing
}

export async function mainBotIsInGroup(groupJid: string): Promise<boolean> {
  const jid = normalizeJid(groupJid)
  if (!isGroupJid(jid) || !mainSock()?.user?.id) return false
  if (Date.now() - lastSync >= SYNC_TTL) await syncMainGroups()
  return groups.has(jid)
}
