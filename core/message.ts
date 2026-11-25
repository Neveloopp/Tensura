/*
 * Construye el objeto "m" que reciben todos los comandos.
 * Mantiene el estilo de Megumin/Viko: m.reply, m.quoted,
 * m.mentionedJid, m.sender, m.chat, m.pushName, etc.
 */
import { downloadMediaMessage } from '@whiskeysockets/baileys'
import {
  getContextInfo,
  getMessageText,
  messageType,
  normalizeJid,
  resolveLidToRealJid,
  unwrapMessage,
  jidNumber,
} from './utils.ts'

function contentOf(message: any, type: string) {
  return type ? message?.[type] : null
}

async function safeDownload(raw: any, sock: any): Promise<Buffer> {
  const options = { logger: sock?.logger, reuploadRequest: sock?.updateMediaMessage }
  try {
    return await downloadMediaMessage(raw, 'buffer', {}, options)
  } catch {
    return await downloadMediaMessage(raw, 'buffer', {})
  }
}

export async function smsg(sock: any, raw: any) {
  const message = unwrapMessage(raw?.message)
  const mtype = messageType(message)
  const msg = contentOf(message, mtype)
  const ctx = getContextInfo(message)

  const m: any = {
    raw,
    key: raw?.key || {},
    id: raw?.key?.id || '',
    chat: normalizeJid(raw?.key?.remoteJid),
    chatId: normalizeJid(raw?.key?.remoteJid),
    fromMe: Boolean(raw?.key?.fromMe),
    isGroup: String(raw?.key?.remoteJid || '').endsWith('@g.us'),
    pushName: raw?.pushName || '',
    message,
    mtype,
    msg,
    text: getMessageText(message),
    mentionedJid: (ctx?.mentionedJid || []).map((jid: string) => normalizeJid(jid)),
  }

  m.sender = normalizeJid(raw?.key?.participant || raw?.key?.remoteJid)
  m.senderName = m.pushName || jidNumber(m.sender)
  m.from = {
    id: jidNumber(m.sender),
    jid: m.sender,
    first_name: m.pushName || 'Usuario',
    username: null,
  }

  if (m.isGroup) {
    m.sender = await resolveLidToRealJid(m.sender, sock, m.chat)
    m.from.id = jidNumber(m.sender)
    m.from.jid = m.sender
    m.mentionedJid = await Promise.all(
      m.mentionedJid.map((jid: string) => resolveLidToRealJid(jid, sock, m.chat))
    )
  }

  m.reply = async (text: string, options: any = {}) => {
    const quoted = options?.quoted || raw
    const payload: any = { text: String(text ?? ''), ...options }
    delete payload.quoted
    try {
      return await sock.sendMessage(m.chat, payload, { quoted })
    } catch (error: any) {
      if (/message to be replied|not found/i.test(String(error?.message || ''))) {
        return await sock.sendMessage(m.chat, payload)
      }
      throw error
    }
  }

  m.send = async (content: any, options: any = {}) => {
    return sock.sendMessage(m.chat, content, { quoted: raw, ...options })
  }

  m.react = async (emoji: string) => {
    return sock.sendMessage(m.chat, { react: { text: emoji, key: raw.key } }).catch(() => null)
  }

  m.delete = async () => {
    return sock.sendMessage(m.chat, { delete: raw.key }).catch(() => null)
  }

  m.download = async () => safeDownload(raw, sock)

  m.quoted = null
  if (ctx?.quotedMessage) {
    const quotedMessage = unwrapMessage(ctx.quotedMessage)
    const quotedType = messageType(quotedMessage)
    const quotedMsg = contentOf(quotedMessage, quotedType)
    const quotedKey = {
      remoteJid: m.chat,
      fromMe: false,
      id: ctx.stanzaId || '',
      participant: normalizeJid(ctx.participant || ''),
    }
    const quotedSender = normalizeJid(ctx.participant || '')

    m.quoted = {
      key: quotedKey,
      id: quotedKey.id,
      message: quotedMessage,
      mtype: quotedType,
      msg: quotedMsg,
      sender: quotedSender,
      from: {
        id: jidNumber(quotedSender),
        jid: quotedSender,
        first_name: '',
        username: null,
      },
      text: getMessageText(quotedMessage),
      isImage: quotedType === 'imageMessage',
      isVideo: quotedType === 'videoMessage',
      isGif: quotedType === 'videoMessage' && Boolean(quotedMsg?.gifPlayback),
      isAudio: quotedType === 'audioMessage',
      isSticker: quotedType === 'stickerMessage',
      isDocument: quotedType === 'documentMessage',
      download: async () =>
        safeDownload(
          {
            key: quotedKey,
            message: quotedMessage,
          },
          sock
        ),
    }
  }

  return m
}
