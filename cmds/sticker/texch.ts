/*
 * Envía un mensaje de texto al canal configurado.
 * Usa el mismo canal y grupo permitido que stch.
 */
import { channelAccessError, getChannelConfig } from '../../core/channel.ts'

export default {
  command: ['texch'],
  alias: ['textchannel', 'textocanal'],
  category: 'otros',
  description: 'Envía un mensaje de texto al canal configurado.',
  usage: '<texto>',
  example: [
    '#texch Hola a todos',
    '#texch (respondiendo a un mensaje)',
    '#stch --config channel https://whatsapp.com/channel/...',
  ],
  async run({ sock, m, args, settings, isOwner }: any) {
    const action = String(args[0] || '').toLowerCase()
    if (['--config', '-c', 'config'].includes(action)) {
      if (!isOwner) return m.reply('(>_<) Solo mi Creador puede configurar el canal.')
      return m.reply(
        '(＾▽＾) TEXCH usa el mismo canal y grupo que STCH.\nConfigura con: stch --config channel <enlace|jid> | group -here'
      )
    }

    const config = getChannelConfig(settings)

    const accessError = channelAccessError(m, config, Boolean(isOwner), 'TEXCH')
    if (accessError) return m.reply(accessError)

    if (!config.channel) {
      return m.reply('(>_<) Configura el canal primero: stch --config channel <enlace|jid>.')
    }

    const text = args.join(' ').trim() || String(m.quoted?.text || '').trim()
    if (!text) {
      return m.reply('(>_<) Escribe el texto que quieres enviar al canal.')
    }
    if (text.length > 4000) {
      return m.reply('(>_<) El texto es demasiado largo. Usa hasta 4000 caracteres.')
    }

    try {
      await sock.sendMessage(config.channel, { text })
      return m.reply('(＾▽＾) Mensaje de texto enviado al canal.')
    } catch (error: any) {
      return m.reply(`(x_x) No pude enviar el mensaje: ${error?.message || 'error desconocido'}`)
    }
  },
}
