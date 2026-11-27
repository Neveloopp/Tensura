/*
 * Exporta el mensaje citado como código listo para ejecutar con .e.
 */
import { proto } from '@whiskeysockets/baileys'
import { messageType } from '../../core/utils.ts'

const typeName = (message: any) => {
  const type = messageType(message)
  if (!type) return 'mensaje'
  return (
    type
      .replace(/Message$/, '')
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/[^a-z0-9_-]/gi, '_')
      .toLowerCase() || 'mensaje'
  )
}

const buildCode = (message: any) => {
  const object = proto.Message.toObject(proto.Message.fromObject(message), {
    longs: String,
    enums: String,
    bytes: String,
  })
  const payload = Buffer.from(JSON.stringify(object), 'utf8').toString('base64')
  return `.e const { proto } = await import('@whiskeysockets/baileys'); await sock.relayMessage(m.chat, proto.Message.fromObject(JSON.parse(Buffer.from('${payload}', 'base64').toString('utf8'))), {})`
}

export default {
  command: ['crm'],
  category: 'owner',
  description: 'Envía el mensaje citado como TXT con código listo para ejecutar con .e.',
  usage: '',
  example: ['#crm (respondiendo a un mensaje)'],
  isOwner: true,
  async run({ m }: any) {
    const quoted = m.quoted
    if (!quoted) {
      return m.reply('(>_<) Responde a un mensaje para exportarlo.')
    }

    const message =
      quoted.message ||
      (quoted.mtype && quoted.msg ? { [quoted.mtype]: quoted.msg } : null)
    if (!message || typeof message !== 'object') {
      return m.reply('(x_x) No pude leer el contenido del mensaje citado.')
    }

    try {
      const type = typeName(message)
      const code = buildCode(message)
      const fileName = `crm-${type}.txt`
      return await m.send({
        document: Buffer.from(code, 'utf8'),
        fileName,
        mimetype: 'text/plain',
        caption: [
          '(＾▽＾) *CRM listo para .e*',
          '',
          `• Tipo: ${type}`,
          `• Archivo: ${fileName}`,
          '• Copia el contenido del TXT y envíalo tal cual.',
        ].join('\n'),
      })
    } catch (error: any) {
      return m.reply(
        `(x_x) No pude preparar el código: ${error?.message || 'error desconocido'}`
      )
    }
  },
}
