/**
 * `pnpm --filter @beatbattle/server seed:weeks` (tarea 3.19): tres samples sintéticos y tres semanas
 * seguidas desde la semana en curso, sobre el almacenamiento falso en disco. Para mirar la home, la ficha y
 * el panel sin Cloudinary ni red.
 *
 * Necesita `BB_FAKE_STORAGE` (la carpeta) y la BD de `DATABASE_URL`. Nunca en producción (`loadEnv` impide
 * el almacenamiento falso allí). Opciones: `--from=AAAA-MM-DD` (un lunes; por defecto, el de esta semana).
 */
import { deflateSync } from 'node:zlib'
import { addDays, formatLocalDate, mondayOf, parseLocalDate, scheduleWeek } from '@beatbattle/rules'
import { color } from '@beatbattle/shared/tokens'
import { eq } from 'drizzle-orm'
import { loadEnv } from '../config/env'
import { createDb } from '../db/client'
import { runMigrations } from '../db/migrate'
import { week } from '../db/schema'
import { systemClock } from '../lib/clock'
import { createUuidV7 } from '../lib/ids'
import { measureAudio } from '../media/measure'
import { createSamplesService } from '../modules/samples/service'
import { createDiskSampleStorage } from '../modules/storage/samples'
import { createWeeksService } from '../modules/weeks/service'

const SAMPLES = [
  {
    title: 'Lluvia en Gràcia',
    credits: 'Rhodes y lluvia · Other People Sound Lab',
    bpm: 92,
    key: 'Dm',
    root: 62,
    genre: 'Boom bap',
  },
  {
    title: 'Neón en Lavapiés',
    credits: 'Sintes analógicos · Other People Sound Lab',
    bpm: 140,
    key: 'F#m',
    root: 66,
    genre: 'Drill',
  },
  {
    title: 'Siesta en Ruzafa',
    credits: 'Guitarra y vinilo · Other People Sound Lab',
    bpm: 84,
    key: 'A',
    root: 57,
    genre: 'Lo-fi',
  },
] as const

const SAMPLE_RATE = 44_100

/** Un bucle de acordes menores (i–VI–III–VII) con un bombo y un plato sencillos: 8 compases. */
function synthLoop(bpm: number, rootMidi: number, minor: boolean): Uint8Array {
  const beat = 60 / bpm
  const bars = 8
  const seconds = bars * 4 * beat
  const frames = Math.round(seconds * SAMPLE_RATE)
  const out = new Float32Array(frames)
  const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)
  const progression = minor ? [0, -4, 3, -2] : [0, 5, -3, 7]
  for (let bar = 0; bar < bars; bar++) {
    const chordRoot = rootMidi + (progression[bar % 4] ?? 0)
    const notes = [chordRoot, chordRoot + (minor ? 3 : 4), chordRoot + 7, chordRoot + 12]
    const start = Math.round(bar * 4 * beat * SAMPLE_RATE)
    const length = Math.round(4 * beat * SAMPLE_RATE)
    for (const note of notes)
      for (let i = 0; i < length; i++) {
        const t = i / SAMPLE_RATE
        const env = Math.min(1, t * 40) * Math.exp(-t * 0.9)
        const f = hz(note)
        const at = start + i
        if (at < frames)
          out[at] =
            (out[at] ?? 0) +
            0.07 * env * (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t))
      }
    for (let step = 0; step < 4; step++) {
      const kickAt = start + Math.round(step * beat * SAMPLE_RATE)
      for (let i = 0; i < SAMPLE_RATE * 0.25 && kickAt + i < frames; i++) {
        const t = i / SAMPLE_RATE
        out[kickAt + i] =
          (out[kickAt + i] ?? 0) +
          0.5 * Math.exp(-t * 18) * Math.sin(2 * Math.PI * (50 + 90 * Math.exp(-t * 30)) * t)
      }
    }
  }
  const data = Buffer.alloc(frames * 4)
  for (let i = 0; i < frames; i++) {
    const value = Math.round(Math.max(-1, Math.min(1, out[i] ?? 0)) * 32767)
    data.writeInt16LE(value, i * 4)
    data.writeInt16LE(value, i * 4 + 2)
  }
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(2, 22)
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(SAMPLE_RATE * 4, 28)
  header.writeUInt16LE(4, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return new Uint8Array(Buffer.concat([header, data]))
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(bytes: Buffer): number {
  let c = 0xffffffff
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 0xff] as number) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

/** Portada de 1024 px: trama de puntos roja sobre negro con un disco, distinta por `seed`. */
function cover(seed: number): Uint8Array {
  const size = 1024
  const rgb = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))
  const [red, black, wine] = [rgb(color.red), rgb(color.black), rgb(color.wine)]
  const raw = Buffer.alloc((size * 3 + 1) * size)
  const cx = size * (0.35 + 0.1 * seed)
  const cy = size * 0.55
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const cell = 24
      const dx = (x % cell) - cell / 2
      const dy = (y % cell) - cell / 2
      const fade = 1 - y / size
      const dot = Math.hypot(dx, dy) < (cell / 2) * fade
      const inDisc = Math.hypot(x - cx, y - cy) < size * 0.28
      const pixel = inDisc ? (Math.hypot(x - cx, y - cy) < size * 0.04 ? black : red) : dot ? wine : black
      const o = y * (size * 3 + 1) + 1 + x * 3
      raw[o] = pixel?.[0] ?? 0
      raw[o + 1] = pixel?.[1] ?? 0
      raw[o + 2] = pixel?.[2] ?? 0
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr.writeUInt8(8, 8)
  ihdr.writeUInt8(2, 9)
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  )
}

const config = loadEnv(process.env)
if (!config.fakeStorageDir) {
  console.error('Falta BB_FAKE_STORAGE: el seed escribe en el almacenamiento falso en disco.')
  process.exit(1)
}
const db = await createDb(config.databaseUrl, config.databaseAuthToken)
await runMigrations(db, config.migrationsDir)
const storage = createDiskSampleStorage({
  root: config.fakeStorageDir,
  baseUrl: '',
  secret: config.auth.secret,
})
const ids = createUuidV7()
const newId = () => ids(systemClock)
const samples = createSamplesService({ db, storage, measure: (source) => measureAudio(source), newId })
const weeks = createWeeksService({ db, storage, newId })

const fromArg = process.argv.find((arg) => arg.startsWith('--from='))?.slice('--from='.length)
const first = fromArg ? parseLocalDate(fromArg) : mondayOf(systemClock.now())

for (const [index, info] of SAMPLES.entries()) {
  const sampleId = newId()
  await storage.put({
    publicId: storage.publicIdFor(sampleId, 'original'),
    bytes: synthLoop(info.bpm, info.root, info.key.endsWith('m')),
    format: 'wav',
  })
  await storage.put({ publicId: storage.publicIdFor(sampleId, 'cover'), bytes: cover(index), format: 'png' })
  const created = await samples.create(
    'seed',
    {
      sampleId,
      title: info.title,
      credits: info.credits,
      licenseText: 'Sample de prueba generado por código: uso libre en la batalla.',
      bpm: info.bpm,
      musicalKey: info.key,
      genreHint: info.genre,
      hasStems: false,
    },
    systemClock.now(),
  )
  const monday = addDays(first, 7 * index)
  const slug = formatLocalDate(monday)
  const [taken] = await db
    .select({ id: week.id })
    .from(week)
    .where(eq(week.startsAt, scheduleWeek(monday).startsAt))
  if (taken) {
    console.log(`semana del ${slug}: ya existe, se deja`)
    continue
  }
  // Programar exige que la semana no haya empezado: el seed la programa «desde antes» de su lunes.
  const scheduled = await weeks.schedule(
    'seed',
    {
      monday: slug,
      sampleId: created.id,
      challenge: index === 0 ? 'Usa solo el primer compás' : null,
      blind: true,
      golden: false,
    },
    scheduleWeek(monday).startsAt - 1,
  )
  console.log(
    `semana ${scheduled.slug} (#${scheduled.number}) con «${created.title}» (${(created.durationMs / 1000).toFixed(1)} s, ${created.loudnessLufs} LUFS)`,
  )
}
process.exit(0)
