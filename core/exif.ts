/*
 * Conversión y metadatos de stickers.
 * Usa sharp para imágenes y ffmpeg para videos/audio.
 */
import fs from 'fs'
import { spawn } from 'child_process'
import { ensureTmpDir, tempFile } from './utils.ts'

let sharpModule: any = null
let sharpTried = false

async function getSharp() {
  if (!sharpTried) {
    sharpTried = true
    try {
      const mod: any = await import('sharp')
      sharpModule = mod?.default || mod
    } catch {}
  }
  return sharpModule
}

export interface StickerMetadata {
  packname?: string
  author?: string
  emojis?: string[]
  categories?: string[]
}

function run(command: string, args: string[], timeoutMs = 120000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`${command} tardó demasiado.`))
    }, timeoutMs)

    child.stdout.on('data', chunk => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', chunk => {
      stderr += chunk.toString()
    })
    child.on('error', error => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', code => {
      clearTimeout(timer)
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(stderr.trim() || `${command} terminó con código ${code}.`))
    })
  })
}

export async function imageToWebp(data: Buffer): Promise<Buffer> {
  const sharp = await getSharp()

  if (sharp) {
    return sharp(data)
      .rotate()
      .resize(512, 512, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .webp({ quality: 82 })
      .toBuffer()
  }

  ensureTmpDir()
  const input = tempFile('image-input', '.img')
  const output = tempFile('image-sticker', '.webp')
  fs.writeFileSync(input, data)

  try {
    await run('ffmpeg', [
      '-y',
      '-i', input,
      '-vf',
      'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,setsar=1',
      '-frames:v', '1',
      '-c:v', 'libwebp',
      '-lossless', '0',
      '-compression_level', '2',
      '-q:v', '82',
      '-an',
      output,
    ])
    return fs.readFileSync(output)
  } finally {
    fs.rmSync(input, { force: true })
    fs.rmSync(output, { force: true })
  }
}

export async function webpToPng(data: Buffer): Promise<Buffer> {
  const sharp = await getSharp()
  if (sharp) return sharp(data).png().toBuffer()

  ensureTmpDir()
  const input = tempFile('toimg-input', '.webp')
  const output = tempFile('toimg-output', '.png')
  fs.writeFileSync(input, data)

  try {
    await run('ffmpeg', ['-y', '-i', input, '-frames:v', '1', output])
    return fs.readFileSync(output)
  } finally {
    fs.rmSync(input, { force: true })
    fs.rmSync(output, { force: true })
  }
}

export async function videoToWebp(data: Buffer, maxSeconds = 6): Promise<Buffer> {
  ensureTmpDir()
  const input = tempFile('video-input', '.mp4')
  const output = tempFile('video-sticker', '.webp')
  fs.writeFileSync(input, data)

  try {
    await run('ffmpeg', [
      '-y',
      '-i', input,
      '-t', String(Math.max(1, Math.min(maxSeconds, 20))),
      '-vf', 'fps=12,scale=512:512:force_original_aspect_ratio=increase,crop=512:512,setsar=1,format=rgba',
      '-vcodec', 'libwebp',
      '-lossless', '0',
      '-compression_level', '2',
      '-q:v', '55',
      '-loop', '0',
      '-an',
      output,
    ])
    return fs.readFileSync(output)
  } finally {
    fs.rmSync(input, { force: true })
    fs.rmSync(output, { force: true })
  }
}

export async function probeDuration(inputPath: string): Promise<number> {
  const { stdout } = await run('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    inputPath,
  ])
  const duration = Number(String(stdout).trim())
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('No pude leer la duración del video.')
  return duration
}

function buildExif(metadata: StickerMetadata): Buffer {
  const json = {
    'sticker-pack-id': 'com.tensura.stickers',
    'sticker-pack-name': metadata.packname || 'Tensura',
    'sticker-pack-publisher': metadata.author || 'Tensura Bot',
    emojis: metadata.emojis?.length ? metadata.emojis : ['✨'],
    'sticker-pack-categories': metadata.categories?.length ? metadata.categories : [''],
  }

  const header = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
    0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
  ])

  const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8')
  const exif = Buffer.concat([header, jsonBuffer])
  exif.writeUInt32LE(jsonBuffer.length, 14)
  return exif
}

function injectExifRiffFallback(webp: Buffer, exifData: Buffer): Buffer {
  if (
    !Buffer.isBuffer(webp) ||
    webp.length < 16 ||
    webp.toString('ascii', 0, 4) !== 'RIFF' ||
    webp.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    throw new Error('El archivo generado no es un WebP válido.')
  }

  const chunks: { id: string; raw: Buffer }[] = []
  let offset = 12
  let hasVp8x = false
  let isAnimated = false

  while (offset + 8 <= webp.length) {
    const id = webp.toString('ascii', offset, offset + 4)
    const size = webp.readUInt32LE(offset + 4)
    const end = offset + 8 + size + (size % 2)
    if (end > webp.length) throw new Error('WebP incompleto.')

    const raw = Buffer.from(webp.subarray(offset, end))
    if (id === 'VP8X') hasVp8x = true
    if (id === 'ANIM' || id === 'ANMF') isAnimated = true
    if (id !== 'EXIF') chunks.push({ id, raw })
    offset = end
  }

  const vp8x = chunks.find(chunk => chunk.id === 'VP8X')
  if (!hasVp8x) {
    const header = Buffer.alloc(18)
    header.write('VP8X', 0, 4, 'ascii')
    header.writeUInt32LE(10, 4)
    header[8] = 0x18 | (isAnimated ? 0x02 : 0x00)
    header.writeUIntLE(511, 12, 3)
    header.writeUIntLE(511, 15, 3)
    chunks.unshift({ id: 'VP8X', raw: header })
  } else if (vp8x && vp8x.raw.length >= 18) {
    vp8x.raw[8] |= 0x08
    if (isAnimated) vp8x.raw[8] |= 0x02
  }

  const exifHeader = Buffer.alloc(8)
  const padding = exifData.length % 2 ? Buffer.from([0]) : Buffer.alloc(0)
  exifHeader.write('EXIF', 0, 4, 'ascii')
  exifHeader.writeUInt32LE(exifData.length, 4)
  chunks.push({ id: 'EXIF', raw: Buffer.concat([exifHeader, exifData, padding]) })

  const body = Buffer.concat(chunks.map(chunk => chunk.raw))
  const riff = Buffer.alloc(12)
  riff.write('RIFF', 0, 4, 'ascii')
  riff.writeUInt32LE(body.length + 4, 4)
  riff.write('WEBP', 8, 4, 'ascii')
  return Buffer.concat([riff, body])
}

export async function addStickerExif(webp: Buffer, metadata: StickerMetadata = {}): Promise<Buffer> {
  const exif = buildExif(metadata)

  try {
    const module: any = await import('node-webpmux')
    const WebpImage = module?.default?.Image || module?.Image || module?.default
    if (WebpImage) {
      const image = new WebpImage()
      await image.load(webp)
      image.exif = exif
      const result = await image.save(null)
      if (Buffer.isBuffer(result) && result.length) return result
    }
  } catch {}

  return injectExifRiffFallback(webp, exif)
}

export async function createStickerBuffer(
  media: { mimetype: string; data: Buffer },
  metadata: StickerMetadata = {}
): Promise<Buffer> {
  const mime = String(media.mimetype || '').toLowerCase()
  const isVideo = mime.includes('video') || mime.includes('gif')
  const webp = isVideo
    ? await videoToWebp(media.data, 6)
    : await imageToWebp(media.data)
  const sticker = await addStickerExif(webp, metadata)

  if (sticker.length > 1024 * 1024) {
    throw new Error('El sticker supera 1 MB. Prueba con un video más corto.')
  }

  return sticker
}

export async function writeExif(
  media: { mimetype: string; data: Buffer },
  metadata: StickerMetadata = {}
): Promise<string> {
  const sticker = await createStickerBuffer(media, metadata)
  const file = tempFile('sticker', '.webp')
  fs.writeFileSync(file, sticker)
  return file
}

export async function convertVideoForAudioSticker(
  inputPath: string,
  outputPath: string,
  maxSeconds = 25,
  metadata: StickerMetadata = {},
  knownDuration?: number
): Promise<Buffer> {
  let webp: Buffer | null = null
  const duration = knownDuration ?? (await probeDuration(inputPath).catch(() => maxSeconds))
  const attempts: [number, number][] =
    duration > 12
      ? [[8, 45], [6, 36], [5, 24], [4, 16]]
      : [[10, 50], [8, 36], [6, 24], [5, 16]]

  for (const [fps, quality] of attempts) {
    await run('ffmpeg', [
      '-y',
      '-i', inputPath,
      '-t', String(maxSeconds),
      '-vf', `fps=${fps},scale=512:512:force_original_aspect_ratio=increase,crop=512:512,setsar=1,format=rgba`,
      '-c:v', 'libwebp',
      '-lossless', '0',
      '-compression_level', '2',
      '-q:v', String(quality),
      '-loop', '0',
      '-an',
      outputPath,
    ])
    webp = fs.readFileSync(outputPath)
    if (webp.length <= 880 * 1024) break
  }

  if (!webp?.length) throw new Error('FFmpeg no generó el sticker animado.')

  const sticker = await addStickerExif(webp, metadata)
  if (sticker.length > 1024 * 1024) {
    throw new Error('El sticker con audio supera 1 MB. Prueba con un video más corto.')
  }

  fs.writeFileSync(outputPath, sticker)
  return sticker
}

export async function extractAudioOpus(
  inputPath: string,
  outputPath: string,
  maxSeconds = 25,
  knownDuration?: number
): Promise<{ oggBuffer: Buffer; seconds: number }> {
  const duration = knownDuration ?? (await probeDuration(inputPath))
  const seconds = Math.max(1, Math.min(maxSeconds, duration))

  await run('ffmpeg', [
    '-y',
    '-i', inputPath,
    '-vn',
    '-map', '0:a:0',
    '-t', String(seconds),
    '-af', 'aresample=48000:async=1:first_pts=0',
    '-c:a', 'libopus',
    '-b:a', '48k',
    '-vbr', 'on',
    '-compression_level', '5',
    '-ac', '1',
    '-ar', '48000',
    '-application', 'audio',
    '-avoid_negative_ts', 'make_zero',
    '-f', 'ogg',
    outputPath,
  ])

  const oggBuffer = fs.readFileSync(outputPath)
  if (!oggBuffer || oggBuffer.length < 200) {
    throw new Error('El video no contiene una pista de audio utilizable.')
  }

  return { oggBuffer, seconds }
}

export async function extractAudioMp3(
  inputPath: string,
  outputPath: string,
  maxSeconds = 600
): Promise<{ buffer: Buffer; seconds: number }> {
  const duration = await probeDuration(inputPath).catch(() => maxSeconds)
  const seconds = Math.max(1, Math.min(maxSeconds, duration))

  await run('ffmpeg', [
    '-y',
    '-i', inputPath,
    '-vn',
    '-map', '0:a:0',
    '-t', String(seconds),
    '-c:a', 'libmp3lame',
    '-b:a', '128k',
    '-ar', '44100',
    '-ac', '2',
    outputPath,
  ])

  const buffer = fs.readFileSync(outputPath)
  if (!buffer || buffer.length < 200) {
    throw new Error('El video no contiene una pista de audio utilizable.')
  }

  return { buffer, seconds }
}

export async function convertVideoToStickerFile(inputPath: string, outputPath: string, maxSeconds = 6) {
  await run('ffmpeg', [
    '-y',
    '-i', inputPath,
    '-t', String(maxSeconds),
    '-vf', 'fps=12,scale=512:512:force_original_aspect_ratio=increase,crop=512:512,setsar=1,format=rgba',
    '-vcodec', 'libwebp',
    '-lossless', '0',
    '-compression_level', '2',
    '-q:v', '55',
    '-loop', '0',
    '-an',
    outputPath,
  ])
  return fs.readFileSync(outputPath)
}
