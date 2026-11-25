/*
 * Carga automática de comandos.
 * Cada archivo .ts dentro de cmds/ puede exportar:
 *
 * export default {
 *   command: ['sticker', 's'],
 *   alias: ['stiker'],
 *   category: 'stickers',
 *   description: '...',
 *   usage: '<pack> | <autor>',
 *   groupOnly: false,
 *   isAdmin: false,
 *   botAdmin: false,
 *   run: async ({ sock, m, args, text, prefix }) => { ... }
 * }
 *
 * También se recarga en caliente al guardar un archivo.
 */
import fs from 'fs'
import path from 'path'
import chalk from 'chalk'
import { fileURLToPath, pathToFileURL } from 'url'
import { registerCommandMeta } from './comandos.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const commandsFolder = path.resolve(__dirname, '../../cmds')
const imported = new Map<string, number>()
const watchers = new Map<string, fs.FSWatcher>()

global.comandos = global.comandos ?? new Map<string, any>()
global.plugins = global.plugins ?? {}

function registerModule(filePath: string, mod: any) {
  const plugin = mod?.default || mod
  const names = (Array.isArray(plugin?.command) ? plugin.command : [plugin?.command])
    .filter(Boolean)
    .map((name: string) => String(name).toLowerCase())

  if (!names.length || typeof plugin?.run !== 'function') return

  const pluginKey = path.relative(commandsFolder, filePath).replace(/\\/g, '/')
  const aliases = [
    ...(Array.isArray(plugin.alias) ? plugin.alias : []),
    ...names.slice(1),
  ]
    .filter(Boolean)
    .map((alias: string) => String(alias).toLowerCase())

  const meta = {
    pluginKey,
    run: plugin.run,
    category: String(plugin.category || 'otros').toLowerCase(),
    description: plugin.description || plugin.desc || 'Sin descripción.',
    usage: plugin.usage || plugin.uso || '',
    example: plugin.example || [],
    isOwner: Boolean(plugin.isOwner),
    isAdmin: Boolean(plugin.isAdmin),
    botAdmin: Boolean(plugin.botAdmin),
    groupOnly: Boolean(plugin.groupOnly),
    privateOnly: Boolean(plugin.privateOnly),
    hidden: Boolean(plugin.hidden),
  }

  for (const [key, value] of global.comandos) {
    if (value?.pluginKey === pluginKey) global.comandos.delete(key)
  }

  for (const name of [names[0], ...aliases]) {
    global.comandos.set(name, meta)
  }

  registerCommandMeta({
    pluginKey,
    name: names[0],
    aliases,
    category: meta.category,
    description: meta.description,
    usage: meta.usage,
    example: meta.example,
    isOwner: meta.isOwner,
    isAdmin: meta.isAdmin,
    botAdmin: meta.botAdmin,
    groupOnly: meta.groupOnly,
    privateOnly: meta.privateOnly,
    hidden: meta.hidden,
  })

  global.plugins[pluginKey] = { ...plugin, dirname: path.dirname(filePath) }
}

async function importModule(filePath: string) {
  const mtime = fs.statSync(filePath).mtimeMs
  if (imported.get(filePath) === mtime) return
  const url = `${pathToFileURL(filePath).href}?v=${mtime}`
  const mod = await import(url)
  imported.set(filePath, mtime)
  registerModule(filePath, mod)
}

function collect(dir: string, files: string[]) {
  let entries: fs.Dirent[] = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      collect(full, files)
      continue
    }
    if (entry.name.endsWith('.ts')) files.push(full)
  }
}

async function scan(dir: string) {
  const files: string[] = []
  collect(dir, files)
  const limit = Math.max(1, Math.min(8, Number(process.env.LOADER_CONCURRENCY || 2)))
  let index = 0

  const worker = async () => {
    while (index < files.length) {
      const file = files[index++]
      try {
        await importModule(file)
      } catch (error: any) {
        console.error(chalk.red(`⚠ No pude cargar ${path.basename(file)}:`), error?.message || error)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, files.length) }, worker))
}

function watchDir(dir: string) {
  if (watchers.has(dir) || !fs.existsSync(dir)) return
  try {
    const watcher = fs.watch(dir, async (_event, filename) => {
      if (!filename || !String(filename).endsWith('.ts')) return
      const full = path.join(dir, String(filename))
      await new Promise(resolve => setTimeout(resolve, 250))
      try {
        await importModule(full)
        console.log(chalk.green(`✓ Comando recargado: ${path.basename(full)}`))
      } catch (error: any) {
        console.error(chalk.red(`⚠ Error recargando ${filename}:`), error?.message || error)
      }
    })
    watcher.unref?.()
    watchers.set(dir, watcher)
  } catch {}

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) watchDir(path.join(dir, entry.name))
  }
}

export default async function seeCommands() {
  await scan(commandsFolder)
  watchDir(commandsFolder)
  return global.comandos.size
}
