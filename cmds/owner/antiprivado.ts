import { updateSettings } from '../../core/system/database.ts'

const HELP = [
  '╭─〔 ANTIPRIVADO 〕',
  '│ ➛ Bloquea los mensajes privados de otras personas.',
  '│ ➛ Se guarda de forma independiente en cada bot.',
  '│',
  '│ Usa: antiprivado on | off',
  '╰────────────',
].join('\n')

export default {
  command: ['antiprivado', 'antipriv', 'antiprivate'],
  category: 'owner',
  description: 'Activa o desactiva el bloqueo de mensajes privados para este bot.',
  usage: 'on | off',
  example: ['#antiprivado on', '#antiprivado off'],
  isOwner: true,
  async run({ m, args, settings }: any) {
    const action = String(args[0] || '').toLowerCase()
    const enabled = Boolean(settings?.antiprivado)

    if (!action || ['status', 'estado'].includes(action)) {
      return m.reply(
        `(＾▽＾) Antiprivado: *${enabled ? 'activado' : 'desactivado'}*.\n${HELP}`
      )
    }

    if (['on', 'activar', 'enable', '1', 'si', 'sí'].includes(action)) {
      updateSettings(settings.id, 'antiprivado', true)
      return m.reply(
        '(＾▽＾) Antiprivado activado. Este bot ignorará los mensajes privados de otras personas.'
      )
    }

    if (['off', 'desactivar', 'disable', '0', 'no'].includes(action)) {
      updateSettings(settings.id, 'antiprivado', false)
      return m.reply('(＾▽＾) Antiprivado desactivado. Este bot volverá a responder en privado.')
    }

    return m.reply(HELP)
  },
}
