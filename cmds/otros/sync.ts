/*
 * Actualización del bot desde GitHub y recarga sin cortar el servidor.
 */
import {
  commandReload,
  pullUpdates,
  pushChanges,
  requestRestart,
  startProjectWatcher,
  syncStatus,
} from '../../core/system/sync.ts'

function short(text: string, max = 900) {
  const value = String(text || '').trim()
  return value.length > max ? `${value.slice(0, max)}...` : value
}

function fileList(files: string[], max = 12) {
  const shown = files.slice(0, max).map(file => `│ • ${file}`)
  if (files.length > max) shown.push(`│ … y ${files.length - max} más`)
  return shown
}

export default {
  command: ['sync'],
  category: 'otros',
  description: 'Actualiza Tensura desde GitHub, recarga comandos y sube cambios.',
  usage: '[status|pull|push [mensaje]|reload|restart]',
  isOwner: true,
  example: [
    '#sync',
    '#sync status',
    '#sync pull',
    '#sync push fix: ajustes del bot',
    '#sync reload',
  ],
  async run({ m, args }: any) {
    const action = String(args[0] || 'pull').toLowerCase()
    const text = args.slice(1).join(' ').trim()

    if (['status', 'estado'].includes(action)) {
      const info = await syncStatus()
      if (!info.ok) return m.reply(`(>_<) ${info.message}`)

      return m.reply(
        [
          '╭─〔 SYNC · ESTADO 〕',
          `│ Repo: ${info.root}`,
          `│ Rama: ${info.branch}`,
          `│ Último: ${info.last}`,
          `│ Adelante: ${info.ahead} · Atrás: ${info.behind}`,
          '│',
          info.status ? '│ Cambios locales:' : '│ Sin cambios locales.',
          ...String(info.status || '').split('\n').filter(Boolean).slice(0, 12).map(line => `│ ${line}`),
          '╰────────────',
        ].join('\n')
      )
    }

    if (['reload', 'recargar'].includes(action)) {
      startProjectWatcher()
      const total = await commandReload()
      return m.reply(`(＾▽＾) Comandos recargados: ${total}.`)
    }

    if (['restart', 'reiniciar'].includes(action)) {
      const scheduled = requestRestart('orden de sync')
      return m.reply(
        scheduled
          ? '⏳ Reiniciando Tensura para aplicar cambios; la sesión se reconectará.'
          : '(>_<) No pude programar el reinicio (node --watch o reinicio automático desactivado).'
      )
    }

    if (['push', 'subir'].includes(action)) {
      try {
        await m.reply('⏳ Subiendo cambios a GitHub...')
        const result = await pushChanges(text)
        if (!result.files.length) return m.reply('(＾▽＾) No hay cambios para subir.')

        return m.reply(
          [
            '╭─〔 SYNC · PUSH 〕',
            `│ Archivos: ${result.files.length}`,
            ...fileList(result.files),
            '│',
            `│ ${short(result.output, 300) || 'Push completado.'}`,
            '╰────────────',
          ].join('\n')
        )
      } catch (error: any) {
        return m.reply(`(x_x) No pude subir los cambios:\n${short(error?.message || error)}`)
      }
    }

    if (!['pull', 'update', 'actualizar', 'auto'].includes(action)) {
      return m.reply(
        '(>_<) Uso: sync [status|pull|push [mensaje]|reload|restart]'
      )
    }

    try {
      await m.reply('⏳ Buscando cambios en GitHub...')
      const result = await pullUpdates()
      const total = await commandReload()

      if (!result.changed.length) {
        return m.reply(
          `(＾▽＾) Tensura ya está actualizado.\n• Comandos: ${total}\n• ${short(result.output, 300) || 'Sin cambios.'}`
        )
      }

      const needsRestart = result.changed.some(
        file => !file.startsWith('cmds/') && /\.(ts|js|json|env)$/i.test(file)
      )

      if (needsRestart) {
        const scheduled = requestRestart('sync desde GitHub')
        return m.reply(
          [
            '╭─〔 SYNC · ACTUALIZADO 〕',
            `│ Archivos: ${result.changed.length}`,
            ...fileList(result.changed),
            '│',
            scheduled
              ? '│ Reiniciando el proceso para aplicar el resto de cambios.'
              : '│ Recarga manual necesaria; reinicio automático desactivado.',
            '╰────────────',
          ].join('\n')
        )
      }

      return m.reply(
        [
          '╭─〔 SYNC · ACTUALIZADO 〕',
          `│ Archivos: ${result.changed.length}`,
          ...fileList(result.changed),
          '│',
          `│ Comandos recargados: ${total}`,
          '╰────────────',
        ].join('\n')
      )
    } catch (error: any) {
      return m.reply(`(x_x) No pude actualizar desde GitHub:\n${short(error?.message || error)}`)
    }
  },
}
