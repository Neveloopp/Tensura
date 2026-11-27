import type { CommandMeta } from './system/comandos.ts'

declare global {
  var sock: any
  var comandos: Map<string, any>
  var plugins: Record<string, any>
  var owner: string[]
  var db: any
  var getSettings: (botId: string) => any
  var updateSettings: (botId: string, key: string, value: any) => any
  var getUser: (jid: string) => any
  var updateUser: (jid: string, key: string, value: any) => any
  var getChat: (jid: string, title?: string) => any
  var updateChat: (jid: string, key: string, value: any) => any
  var getGroup: (jid: string, title?: string) => any
  var updateGroup: (jid: string, updater: any, title?: string) => any
  var getStickerMeta: (jid: string) => any
  var updateStickerMeta: (jid: string, key: string, value: any) => any
  var getActivity: (botId: string) => any
  var recordActivity: (
    botId: string,
    chatId: string,
    name?: string,
    type?: 'group' | 'private',
    score?: number
  ) => any
  var topChats: (botId: string, limit?: number) => Array<Record<string, any>>
  var allActivity: () => Record<string, any>
  var allUsers: () => Record<string, any>
  var allChats: () => Record<string, any>
  var flushDB: () => void
  var commands: CommandMeta[]
}

export {}
