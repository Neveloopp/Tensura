/*
 * Benchmark local de Tensura.
 * Mide el costo del handler, la base de datos y los stickers
 * sin depender de una sesión real de WhatsApp.
 *
 * Uso:
 *   BENCH_LATENCY_MS=25 BENCH_ITER=12 node --import tsx scripts/benchmark.ts
 */
import fs from 'fs'
import { execFileSync } from 'child_process'
import { performance } from 'perf_hooks'
import { initDB, updateChat, updateUser } from '../core/system/database.ts'
import seeCommands from '../core/system/commandLoader.ts'
import handler from '../handler.ts'
import { smsg } from '../core/message.ts'
import { createStickerBuffer } from '../core/exif.ts'
import { sendAudioSticker } from '../core/audioSticker.ts'

const LATENCY = Number(process.env.BENCH_LATENCY_MS || 25)
const ITER = Math.max(3, Number(process.env.BENCH_ITER || 12))
const WARMUP = 2
const OUT = process.env.BENCH_OUT || 'bench.json'
const VIDEO = 'tmp-test/test.mp4'
const IMAGE = 'tmp-test/test.png'
const BOT = '999@s.whatsapp.net'
const SENDER = '123@s.whatsapp.net'

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function fixture() {
  fs.mkdirSync('tmp-test', { recursive: true })
  if (!fs.existsSync(VIDEO)) {
    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-f', 'lavfi',
        '-i', 'testsrc=size=320x240:rate=15',
        '-f', 'lavfi',
        '-i', 'sine=frequency=440',
        '-t', '3',
        '-c:v', 'mpeg4',
        '-c:a', 'aac',
        '-shortest',
        VIDEO,
      ],
      { stdio: 'ignore' }
    )
  }
  if (!fs.existsSync(IMAGE)) {
    execFileSync('ffmpeg', ['-y', '-i', VIDEO, '-frames:v', '1', IMAGE], {
      stdio: 'ignore',
    })
  }
}

function makeSock(counter: { sends: number }) {
  return {
    user: { id: `${BOT.split('@')[0]}:1@s.whatsapp.net` },
    readMessages: async () => {
      await sleep(LATENCY)
    },
    sendPresenceUpdate: async () => {
      await sleep(LATENCY)
    },
    sendMessage: async () => {
      counter.sends += 1
      await sleep(LATENCY)
      return { key: { id: `bench-${counter.sends}` } }
    },
    groupMetadata: async () => {
      await sleep(LATENCY)
      return {
        subject: 'Bench Group',
        participants: [
          { id: BOT, admin: 'admin' },
          { id: SENDER, admin: 'admin' },
        ],
      }
    },
    relayMessage: async () => {
      await sleep(LATENCY)
    },
    waUploadToServer: async () => {
      await sleep(LATENCY)
      return { mediaUrl: 'https://bench.local/media', directPath: '/bench' }
    },
  }
}

function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const sum = sorted.reduce((total, value) => total + value, 0)
  const at = (percent: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor((percent / 100) * sorted.length))]
  return {
    avg: Number((sum / sorted.length).toFixed(2)),
    p50: Number(at(50).toFixed(2)),
    p95: Number(at(95).toFixed(2)),
    min: Number(sorted[0].toFixed(2)),
    max: Number(sorted[sorted.length - 1].toFixed(2)),
  }
}

async function measure(
  name: string,
  fn: (index: number) => Promise<void>,
  iterations = ITER
) {
  for (let i = 0; i < WARMUP; i++) await fn(i)
  const times: number[] = []
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    await fn(i + WARMUP)
    times.push(performance.now() - start)
  }
  return { name, ...stats(times) }
}

async function runCommand(
  sock: any,
  text: string,
  options: { group?: boolean; jid?: string } = {}
) {
  const chat = options.jid || (options.group ? '120363000000000001@g.us' : SENDER)
  const raw = {
    key: {
      remoteJid: chat,
      fromMe: false,
      id: `BENCH-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      ...(options.group ? { participant: SENDER } : {}),
    },
    message: { conversation: text },
    pushName: 'Bench',
  }
  const m = await smsg(sock, raw)
  await handler(sock, m)
}

async function main() {
  fixture()
  fs.rmSync('database', { recursive: true, force: true })
  initDB()

  const loaderStart = performance.now()
  const commandNames = await seeCommands()
  const loaderMs = Number((performance.now() - loaderStart).toFixed(2))

  const results: any = {
    meta: {
      latencyMs: LATENCY,
      iterations: ITER,
      commandNames,
      loaderMs,
      at: new Date().toISOString(),
    },
  }

  const originalLog = console.log
  console.log = () => {}

  try {
    const privateCounter = { sends: 0 }
    const privateSock = makeSock(privateCounter)

    results.ping = await measure('ping', async () => {
      await runCommand(privateSock, '#ping')
    })

    results.menuPrivate = await measure('menu-private', async () => {
      await runCommand(privateSock, '#menu')
    })

    results.infobot = await measure('infobot', async () => {
      await runCommand(privateSock, '#infobot')
    })

    const groupCounter = { sends: 0 }
    const groupSock = makeSock(groupCounter)
    let groupIndex = 0

    results.menuGroupCold = await measure(
      'menu-group-cold',
      async () => {
        groupIndex += 1
        await runCommand(groupSock, '#menu', {
          group: true,
          jid: `12036300000000${String(groupIndex).padStart(4, '0')}@g.us`,
        })
      },
      Math.min(ITER, 6)
    )

    results.menuGroupWarm = await measure('menu-group-warm', async () => {
      await runCommand(groupSock, '#menu', { group: true })
    })

    const image = fs.readFileSync(IMAGE)
    results.stickerImage = await measure(
      'sticker-image',
      async () => {
        await createStickerBuffer(
          { mimetype: 'image/png', data: image },
          { packname: 'Bench', author: 'Bench' }
        )
      },
      5
    )

    const audioSock = makeSock({ sends: 0 })
    results.stickerAudio = await measure(
      'sticker-audio',
      async index => {
        const output = `tmp-test/bench-${index}.webp`
        const audio = `tmp-test/bench-${index}.ogg`
        try {
          await sendAudioSticker({
            sock: audioSock,
            chat: '120363000000000001@g.us',
            inputPath: VIDEO,
            outputPath: output,
            audioPath: audio,
            maxSeconds: 25,
            metadata: { packname: 'Bench', author: 'Bench' },
          })
        } finally {
          fs.rmSync(output, { force: true })
          fs.rmSync(audio, { force: true })
        }
      },
      3
    )

    results.dbUpdates = await measure(
      'db-updates',
      async index => {
        updateChat('120363000000000099@g.us', 'stats', { at: index })
        updateUser('123@s.whatsapp.net', 'usedcommands', index)
      },
      20
    )
  } finally {
    console.log = originalLog
  }

  fs.writeFileSync(OUT, JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 2))
  await sleep(100)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
