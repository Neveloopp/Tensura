/*
 * Registro central de comandos para el menú.
 * El loader llena este arreglo automáticamente al
 * escanear la carpeta cmds/. No necesitas editarlo
 * al crear un comando nuevo.
 */
export interface CommandMeta {
  pluginKey?: string
  name: string
  aliases: string[]
  category: string
  description: string
  usage?: string
  example?: string[]
  isOwner?: boolean
  isAdmin?: boolean
  botAdmin?: boolean
  groupOnly?: boolean
  privateOnly?: boolean
  hidden?: boolean
}

export const commands: CommandMeta[] = []

export function registerCommandMeta(meta: CommandMeta) {
  const clean: CommandMeta = {
    ...meta,
    pluginKey: String(meta.pluginKey || ''),
    name: String(meta.name || '').toLowerCase(),
    aliases: [...new Set((meta.aliases || []).map(a => String(a).toLowerCase()).filter(Boolean))],
    category: String(meta.category || 'otros').toLowerCase(),
    description: String(meta.description || 'Sin descripción.'),
  }

  if (!clean.name) return

  if (clean.pluginKey) {
    for (let i = commands.length - 1; i >= 0; i--) {
      if (commands[i].pluginKey === clean.pluginKey) commands.splice(i, 1)
    }
  }

  const index = commands.findIndex(item => item.name === clean.name)
  if (index >= 0) commands[index] = clean
  else commands.push(clean)
}

export function removeCommandMeta(pluginKey: string) {
  if (!pluginKey) return
  for (let i = commands.length - 1; i >= 0; i--) {
    if (commands[i].pluginKey === pluginKey) commands.splice(i, 1)
  }
}

export function getCategories() {
  const order = ['info', 'grupo', 'dow', 'sticker', 'otros']
  const categories = [...new Set(commands.filter(c => !c.hidden).map(c => c.category))]
  return categories.sort((a, b) => {
    const indexA = order.indexOf(a)
    const indexB = order.indexOf(b)
    if (indexA === -1 && indexB === -1) return a.localeCompare(b, 'es')
    if (indexA === -1) return 1
    if (indexB === -1) return -1
    return indexA - indexB
  })
}

export function getCommandsByCategory(category: string) {
  return commands
    .filter(c => !c.hidden && c.category === String(category || '').toLowerCase())
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
}
