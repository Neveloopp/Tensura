/*
 * Sticker con audio para canal.
 * `stch --config` permite configurar el destino y el estilo.
 */
import fs from 'fs'
import {
  downloadStickerAudio,
  sendAudioSticker,
  sendPreparedAudioSticker,
} from '../../core/audioSticker.ts'
import {
  channelAccessError,
  getChannelConfig,
  parseDestination,
  resolveChannelDestination,
} from '../../core/channel.ts'
import { probeDuration } from '../../core/exif.ts'
import { updateSettings } from '../../core/system/database.ts'
import { normalizeJid, removeFile, tempFile } from '../../core/utils.ts'

function helpText(prefix: string, config: ReturnType<typeof getChannelConfig>) {
  const p = prefix || '#'
  return [
    '╭─〔 STCH · CONFIGURACIÓN 〕',
    `│ ➛ Estado: ${config.enabled ? 'activo' : 'desactivado'}`,
    `│ ➛ Canal: ${config.channel || 'sin configurar'}`,
    `│ ➛ Grupo permitido: ${config.group || 'sin configurar (solo Creador)'}`,
    `│ ➛ Pack: ${config.pack}`,
    `│ ➛ Autor: ${config.author}`,
    `│ ➛ Máximo: ${config.maxSeconds}s`,
    `│ ➛ Entrada: video o sticker con audio`,
    '│',
    '│ Para cambiar:',
    `│ ${p}stch --config channel https://whatsapp.com/channel/...`,
    `│ ${p}stch --config group -here (dentro del grupo)`,
    `│ ${p}stch --config pack Mi Pack`,
    `│ ${p}stch --config author Mi Nombre`,
    `│ ${p}stch --config max 25`,
    `│ ${p}stch --config on | off`,
    `│ ${p}stch --config reset`,
    '╰────────────',
  ].join('\n')
}

function isVideo(source: any) {
  const mimetype = String(source?.msg?.mimetype || '')
  return Boolean(
    source?.isVideo ||
      source?.isGif ||
      source?.mtype === 'videoMessage' ||
      /^video\//i.test(mimetype)
  )
}

export default {
  command: ['stch'],
  alias: ['stickerchannel', 'stickeraudiochannel'],
  category: 'sticker',
  description: 'Publica un sticker con audio en el canal configurado; acepta videos o stickers con audio ya hechos.',
  usage: '[--config]',
  example: [
    '#stch (respondiendo a un video)',
    '#stch (respondiendo a un sticker con audio)',
    '#stch --config',
    '#stch --config channel https://whatsapp.com/channel/...',
    '#stch --config group -here',
  ],
  async run({ sock, m, args, prefix, settings, isOwner }: any) {
    const botId = normalizeJid(settings?.id || sock?.user?.id || '')
    const config = getChannelConfig(settings)
    const action = String(args[0] || '').toLowerCase()

    if (action === '--config' || action === '-c' || action === 'config') {
      if (!isOwner) return m.reply('(>_<) Solo mi Creador puede configurar STCH.')
      const key = String(args[1] || '').toLowerCase()
      const value = args.slice(2).join(' ').trim()

      if (!key) return m.reply(helpText(prefix, config))

      if (key === 'reset' || key === 'restablecer') {
        updateSettings(botId, 'stch', {})
        return m.reply('(＾▽＾) Configuración de STCH restablecida.')
      }

      if (['on', 'enable', 'activar'].includes(key)) {
        updateSettings(botId, 'stch', { ...config, enabled: true })
        return m.reply('(＾▽＾) STCH activado.')
      }

      if (['off', 'disable', 'desactivar'].includes(key)) {
        updateSettings(botId, 'stch', { ...config, enabled: false })
        return m.reply('(＾▽＾) STCH desactivado.')
      }

      if (['channel', 'canal'].includes(key)) {
        let channel = ''
        try {
          channel = await resolveChannelDestination(sock, value)
        } catch (error: any) {
          return m.reply(`(>_<) ${error?.message || 'No pude resolver el enlace del canal.'}`)
        }
        if (!channel) return m.reply('(>_<) Indica el JID o enlace del canal.')
        updateSettings(botId, 'stch', { ...config, channel })
        return m.reply(`(＾▽＾) Canal configurado: ${channel}`)
      }

      if (['group', 'grupo'].includes(key)) {
        const normalizedValue = value.toLowerCase()
        if (!value || ['off', 'none', 'ninguno', 'clear'].includes(normalizedValue)) {
          updateSettings(botId, 'stch', { ...config, group: '' })
          return m.reply('(＾▽＾) Grupo eliminado. Solo el Creador podrá usar STCH hasta configurar uno.')
        }
        if (['-here', 'here', 'aqui', 'aquí'].includes(normalizedValue)) {
          if (!m.isGroup) {
            return m.reply('(>_<) Usa -here dentro del grupo que quieres permitir.')
          }
          const group = normalizeJid(m.chat)
          updateSettings(botId, 'stch', { ...config, group })
          return m.reply(`(＾▽＾) Grupo permitido: ${group}`)
        }
        const group = parseDestination(value, '@g.us')
        if (!group) return m.reply('(>_<) Indica el JID del grupo o usa -here.')
        updateSettings(botId, 'stch', { ...config, group })
        return m.reply(`(＾▽＾) Grupo permitido: ${group}`)
      }

      if (['pack', 'paquete'].includes(key)) {
        if (!value) return m.reply('(>_<) Indica el nombre del pack.')
        updateSettings(botId, 'stch', { ...config, pack: value.slice(0, 40) })
        return m.reply(`(＾▽＾) Pack: ${value.slice(0, 40)}`)
      }

      if (['author', 'autor'].includes(key)) {
        if (!value) return m.reply('(>_<) Indica el nombre del autor.')
        updateSettings(botId, 'stch', { ...config, author: value.slice(0, 60) })
        return m.reply(`(＾▽＾) Autor: ${value.slice(0, 60)}`)
      }

      if (['max', 'maxseconds', 'maximo', 'máximo'].includes(key)) {
        const seconds = Number(value.replace(',', '.'))
        if (!Number.isFinite(seconds) || seconds < 1 || seconds > 60) {
          return m.reply('(>_<) El máximo debe estar entre 1 y 60 segundos.')
        }
        updateSettings(botId, 'stch', { ...config, maxSeconds: seconds })
        return m.reply(`(＾▽＾) Máximo configurado: ${seconds}s`)
      }

      return m.reply(helpText(prefix, config))
    }

    if (!config.enabled) {
      return m.reply('(>_<) STCH está desactivado. Usa stch --config on para activarlo.')
    }

    const accessError = channelAccessError(m, config, Boolean(isOwner), 'STCH')
    if (accessError) return m.reply(accessError)

    if (!config.channel) {
      return m.reply('(>_<) Configura el canal primero: stch --config channel <enlace|jid>.')
    }

    const direct = ['videoMessage', 'stickerMessage'].includes(m.mtype) ? m : null
    const source = m.quoted || direct

    if (!source) {
      return m.reply(
        '(>_<) Responde a un video o a un sticker con audio para publicarlo en el canal.'
      )
    }

    const stickerAudio = source?.msg?.audioMessage || source?.message?.stickerMessage?.audioMessage
    if (stickerAudio) {
      try {
        const download = source?.download || m.download
        const stickerBuffer = await download()
        if (!stickerBuffer?.length) throw new Error('No pude descargar el sticker.')
        const audioBuffer = await downloadStickerAudio(stickerAudio)
        await m.reply('⏳ Publicando el sticker con audio en el canal...')
        await sendPreparedAudioSticker({
          sock,
          chat: config.channel,
          stickerBuffer,
          audioBuffer,
          seconds: Number(stickerAudio.seconds) || 5,
          isAnimated: source?.msg?.isAnimated !== false,
          ptt: Boolean(stickerAudio.ptt),
        })
        return m.reply('(＾▽＾) Sticker con audio publicado en el canal.')
      } catch (error: any) {
        return m.reply(
          `(x_x) No pude publicar el sticker: ${error?.message || 'error desconocido'}`
        )
      }
    }

    if (!isVideo(source)) {
      return m.reply('(>_<) El archivo citado no es un video ni un sticker con audio.')
    }

    let input = ''
    let output = ''
    let audioOutput = ''

    try {
      const download = source?.download || m.download
      const buffer = await download()
      if (!buffer?.length) throw new Error('No pude descargar el video.')

      input = tempFile('stch-input', '.mp4')
      output = tempFile('stch-output', '.webp')
      audioOutput = tempFile('stch-audio', '.ogg')
      fs.writeFileSync(input, buffer)

      const messageSeconds = Number(source?.msg?.seconds ?? m.msg?.seconds ?? 0)
      const durationFallback =
        Number.isFinite(messageSeconds) && messageSeconds > 0
          ? messageSeconds
          : config.maxSeconds
      const duration = await probeDuration(input, durationFallback)
      await m.reply('⏳ Procesando el sticker con audio para el canal...')

      await sendAudioSticker({
        sock,
        chat: config.channel,
        inputPath: input,
        outputPath: output,
        audioPath: audioOutput,
        maxSeconds: config.maxSeconds,
        metadata: {
          packname: config.pack,
          author: config.author,
          emojis: ['🔊'],
        },
        duration,
      })

      const trimmed = duration > config.maxSeconds
      return m.reply(
        `(＾▽＾) Sticker con audio publicado en el canal.\n• Duración: ${Math.ceil(
          Math.min(config.maxSeconds, duration)
        )}s${trimmed ? ' (recortado automáticamente)' : ''}`
      )
    } catch (error: any) {
      return m.reply(`(x_x) No pude publicar el sticker: ${error?.message || 'error desconocido'}`)
    } finally {
      removeFile(input)
      removeFile(output)
      removeFile(audioOutput)
    }
  },
}
