/*
 * Mantiene el bot sincronizado con el repositorio público.
 *
 * - Con git: pull/push y reinicio del proceso para aplicar cambios de núcleo.
 * - Sin git: descarga el archivo de GitHub y copia solo los archivos cambiados
 *   (nunca toca .env, .env.example, settings.ts, Sessions ni database).
 * - Vigila el proyecto para recargar comandos o reiniciar el proceso.
 */
import 'dotenv/config'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync, spawn } from 'child_process'
import { reloadCommands } from './commandLoader.ts'

export const PROJECT_ROOT = path.resolve(process.env.SYNC_DIR || process.cwd())
const SYNC_BRANCH = process.env.SYNC_BRANCH || 'main'
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'Sessions',
  'database',
  'tmp',
  'logs',
  '.cache',
])
let watcherStarted = false
let restarting = false
let restartTimer: NodeJS.Timeout | null = null
let beforeRestart: (() => Promise<void> | void) | null = null

export function setBeforeRestart(handler: () => Promise<void> | void) {
  beforeRestart = handler
}

function findGitRoot(): string | null {
  const candidates = [PROJECT_ROOT, process.cwd()]
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, '.git'))) return candidate
  }
  return null
}

function requireGitRoot(): string {
  const root = findGitRoot()
  if (!root) {
    throw new Error(
      `No hay un repositorio git en ${PROJECT_ROOT}.\n` +
        'Define SYNC_DIR apuntando a un clon o usa sync pull en modo archivo.'
    )
  }
  return root
}

function git(root: string, args: string[], allowFail = false): string {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
  }
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  if (token) {
    env.GIT_CONFIG_COUNT = '1'
    env.GIT_CONFIG_KEY_0 = 'credential.helper'
    env.GIT_CONFIG_VALUE_0 =
      '!f() { echo username=x-access-token; echo password=$GITHUB_TOKEN; }; f'
    env.GITHUB_TOKEN = token
  }

  try {
    return execFileSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      env,
      timeout: 120_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch (error: any) {
    if (allowFail) return ''
    const detail = String(error?.stderr || error?.message || error).trim()
    throw new Error(detail || `git ${args.join(' ')} falló`)
  }
}

function repoSlug(): string {
  const raw = (process.env.SYNC_REPO || 'https://github.com/Neveloopp/Tensura').trim()
  const short = raw.match(/^([\w.-]+)\/([\w.-]+?)(?:\.git)?$/)
  const match = short || raw.match(/github\.com[/:]([^/]+)\/([^/.]+)/i)
  if (!match) throw new Error(`Repositorio no válido: ${raw}`)
  return `${match[1]}/${match[2]}`
}

function walkFiles(root: string, base = ''): string[] {
  const current = path.join(root, base)
  let files: string[] = []
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const rel = path.posix.join(base, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      files = files.concat(walkFiles(root, rel))
      continue
    }
    if (!entry.isFile()) continue
    if (protectedPath(rel)) continue
    files.push(rel)
  }
  return files
}

function protectedPath(file: string): boolean {
  const rel = file.replace(/\\/g, '/')
  return (
    /(^|\/)settings\.ts$/.test(rel) ||
    /(^|\/)\.env(?:\.|$)/.test(rel) ||
    /(^|\/)Screenshot/i.test(rel)
  )
}

function sameFile(a: string, b: string): boolean {
  try {
    const left = fs.readFileSync(a)
    const right = fs.readFileSync(b)
    return left.equals(right)
  } catch {
    return false
  }
}

async function pullArchive(): Promise<{ changed: string[]; output: string }> {
  const slug = repoSlug()
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tensura-sync-'))
  const archive = path.join(temp, 'repo.tar.gz')

  try {
    const url = `https://codeload.github.com/${slug}/tar.gz/refs/heads/${encodeURIComponent(SYNC_BRANCH)}`
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Tensura-Sync' },
      redirect: 'follow',
      signal: AbortSignal.timeout(60_000),
    })
    if (!response.ok) throw new Error(`GitHub respondió ${response.status} al descargar ${slug}.`)

    fs.writeFileSync(archive, Buffer.from(await response.arrayBuffer()))
    execFileSync('tar', ['-xzf', archive, '-C', temp], { stdio: 'ignore' })

    const top = fs
      .readdirSync(temp, { withFileTypes: true })
      .find(entry => entry.isDirectory() && entry.name !== 'node_modules')
    if (!top) throw new Error('El archivo de GitHub no contiene el proyecto.')

    const source = path.join(temp, top.name)
    const files = walkFiles(source)
    const changed: string[] = []

    for (const rel of files) {
      const from = path.join(source, rel)
      const to = path.join(PROJECT_ROOT, rel)
      if (sameFile(from, to)) continue
      fs.mkdirSync(path.dirname(to), { recursive: true })
      fs.copyFileSync(from, to)
      changed.push(rel)
    }

    return {
      changed,
      output: changed.length
        ? `Descargado ${slug}@${SYNC_BRANCH} (modo archivo).`
        : `Sin cambios en ${slug}@${SYNC_BRANCH} (modo archivo).`,
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true })
  }
}

export async function syncStatus() {
  const root = findGitRoot()
  if (!root) {
    return {
      ok: true,
      root: PROJECT_ROOT,
      branch: `${SYNC_BRANCH} (archivo)`,
      status: '',
      last: 'Sin git local; sync pull descarga el ZIP de GitHub.',
      ahead: 0,
      behind: 0,
      message: '',
    }
  }

  try {
    const branch = git(root, ['branch', '--show-current']) || '(detached)'
    const last = git(root, ['log', '-1', '--pretty=%h %s'], true) || 'sin commits'
    const status = git(root, ['status', '--porcelain'], true)
    const counts = git(root, ['rev-list', '--left-right', '--count', 'HEAD...@{u}'], true)
    const [ahead, behind] = counts.split(/\s+/).map(Number)

    return {
      ok: true,
      root,
      branch,
      status,
      last,
      ahead: Number.isFinite(ahead) ? ahead : 0,
      behind: Number.isFinite(behind) ? behind : 0,
      message: '',
    }
  } catch (error: any) {
    return {
      ok: false,
      root,
      branch: '',
      status: '',
      last: '',
      ahead: 0,
      behind: 0,
      message: String(error?.message || error),
    }
  }
}

export async function pullUpdates(): Promise<{ changed: string[]; output: string }> {
  const root = findGitRoot()
  if (!root) return pullArchive()

  const before = git(root, ['rev-parse', 'HEAD'])
  let output = ''
  try {
    output = git(root, ['pull', '--ff-only'])
  } catch (error: any) {
    throw new Error(
      `No pude actualizar el repositorio:\n${String(error?.message || error)}\n` +
        'Si hay cambios locales, usa sync push primero.'
    )
  }
  const after = git(root, ['rev-parse', 'HEAD'])
  const changed =
    before === after
      ? []
      : git(root, ['diff', '--name-only', before, after], true).split('\n').filter(Boolean)

  return { changed, output }
}

export async function pushChanges(message = ''): Promise<{ files: string[]; output: string }> {
  const root = requireGitRoot()
  const status = git(root, ['status', '--porcelain'], true)
  if (!status) return { files: [], output: 'Sin cambios.' }

  const files = status
    .split('\n')
    .map(line => {
      const raw = line.slice(3).trim()
      return raw.includes(' -> ') ? raw.split(' -> ').pop()!.trim() : raw
    })
    .filter(Boolean)
    .filter(file => !protectedPath(file))

  if (!files.length) {
    return {
      files: [],
      output: 'Solo hay cambios en archivos protegidos (settings.ts, .env). No se subieron.',
    }
  }

  git(root, [
    'add',
    '-A',
    '--',
    '.',
    ':(exclude)settings.ts',
    ':(exclude).env',
    ':(exclude).env.*',
    ':(exclude)Screenshot_*',
  ])
  let staged = git(root, ['diff', '--cached', '--name-only'], true)
  for (const file of staged.split('\n').filter(Boolean)) {
    if (protectedPath(file)) git(root, ['reset', '-q', 'HEAD', '--', file], true)
  }
  staged = git(root, ['diff', '--cached', '--name-only'], true)
  if (!staged) return { files: [], output: 'Sin cambios para subir.' }

  const identity: string[] = []
  if (!git(root, ['config', 'user.name'], true)) identity.push('-c', 'user.name=Tensura')
  if (!git(root, ['config', 'user.email'], true)) identity.push('-c', 'user.email=tensura@local')
  const commitMessage = message || `sync: actualizar Tensura ${new Date().toISOString().slice(0, 16)}`
  const output = git(root, [...identity, 'commit', '-m', commitMessage])
  const upstream = git(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], true)
  const branch = upstream ? upstream.replace(/^[^/]+\//, '') : git(root, ['branch', '--show-current']) || 'main'
  const pushOutput = git(root, ['push', 'origin', `HEAD:${branch}`])
  return {
    files: staged.split('\n').filter(Boolean).filter(file => !protectedPath(file)),
    output: `${output}\n${pushOutput}`.trim(),
  }
}

export function commandReload(): Promise<number> {
  return reloadCommands()
}

export function requestRestart(reason = 'cambios detectados'): boolean {
  if (process.env.TENSURA_AUTO_RESTART === '0') return false
  if (process.execArgv.includes('--watch') || process.argv.includes('--watch')) return false
  if (restarting) return true
  restarting = true

  console.log(`[sync] reiniciando Tensura: ${reason}`)
  const supervised =
    process.env.pm_id ||
    process.env.PM2_HOME ||
    process.env.P_SERVER_UUID ||
    process.env.DYNO ||
    process.env.RAILWAY_ENVIRONMENT ||
    process.env.RENDER ||
    process.env.FLY_APP_NAME

  const stop = async () => {
    try {
      await beforeRestart?.()
    } catch (error: any) {
      console.error('[sync] error al preparar el reinicio:', error?.message || error)
    }
  }

  if (supervised) {
    setTimeout(async () => {
      await stop()
      process.exit(0)
    }, 1200)
    return true
  }

  restartTimer = setTimeout(async () => {
    await stop()
    const args = [...process.execArgv, ...process.argv.slice(1)]
    const child = spawn(process.execPath, args, {
      cwd: PROJECT_ROOT,
      detached: true,
      stdio: 'inherit',
      env: { ...process.env, TENSURA_AUTO_RESTARTED: '1' },
    })
    child.on('error', error => console.error('[sync] no pude reiniciar:', error))
    child.unref()
    setTimeout(() => process.exit(0), 250)
  }, 1500)
  restartTimer.unref()
  return true
}

export function startProjectWatcher(): void {
  if (watcherStarted || process.env.SYNC_WATCH === '0') return
  watcherStarted = true

  let pending: NodeJS.Timeout | null = null
  const schedule = (file: string) => {
    if (pending) clearTimeout(pending)
    pending = setTimeout(async () => {
      pending = null
      if (!fs.existsSync(file)) return
      const rel = path.relative(PROJECT_ROOT, file).split(path.sep).join('/')

      if (rel.startsWith('cmds/')) {
        try {
          const total = await reloadCommands()
          console.log(`[sync] comandos recargados (${total}): ${rel}`)
        } catch (error: any) {
          console.error('[sync] error al recargar comandos:', error?.message || error)
        }
        return
      }

      requestRestart(rel)
    }, 600)
  }

  try {
    fs.watch(PROJECT_ROOT, { recursive: true }, (_event, filename) => {
      if (!filename) return
      const rel = String(filename).split(path.sep).join('/')
      if (!/\.(ts|js|json|env)$/i.test(rel)) return
      if (/(^|\/)(node_modules|\.git|Sessions|database|tmp|logs)(\/|$)/.test(rel)) return
      schedule(path.join(PROJECT_ROOT, String(filename)))
    })
    console.log('[sync] watcher activo para cambios de código.')
  } catch (error: any) {
    watcherStarted = false
    console.error('[sync] no pude iniciar el watcher:', error?.message || error)
  }
}
