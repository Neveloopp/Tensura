export default {
  command: ['bots', 'subbots'],
  category: 'owner',
  description: 'Muestra la cantidad de sub bots conectados.',
  usage: '',
  example: ['#bots'],
  isOwner: true,
  async run({ m }: any) {
    const manager = (global as any).subbotManager
    if (!manager) {
      return m.reply('(>_<) El sistema de sub bots todavía no está disponible.')
    }

    const data = await manager.snapshot()
    const connected = data.bots.filter((bot: any) => bot.connected)
    const lines = [
      '╭─〔 SUB BOTS 〕',
      `│ ➛ Conectados: ${connected.length}`,
      `│ ➛ Registrados: ${data.stats.total}`,
      `│ ➛ Habilitados: ${data.stats.enabled}`,
      `│ ➛ Vinculando: ${data.stats.pairing}`,
      '╰────────────',
    ]

    if (connected.length) {
      lines.splice(
        5,
        0,
        '│',
        '│ Cuentas activas:',
        ...connected.map((bot: any) => `│ ➛ ${bot.name} (+${bot.phone})`)
      )
    }

    return m.reply(lines.join('\n'))
  },
}
