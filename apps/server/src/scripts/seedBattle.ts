/**
 * Datos de prueba de una semana en juego (tarea 5.20, §4.4 `tools/seed`): la semana del lunes actual con su
 * sample, `producers` entradas de cuentas distintas (audio sintético medido de verdad con ffmpeg) y `voters`
 * cuentas que ya han votado algunas, para mirar la rejilla, la ficha, el reproductor y el Modo Jurado.
 *
 * Todo pasa por la API, como un usuario (alta y verificación, bases, firma, subida al almacenamiento falso,
 * registro, escucha y voto), con la app en este mismo proceso y su reloj movido a mano. La BD y la carpeta del
 * almacenamiento falso quedan listas para arrancar después la API con ellas:
 *
 *   pnpm --filter @beatbattle/server exec tsx src/scripts/seedBattle.ts <bd.db> <carpeta> [entradas] [votantes]
 *   NODE_ENV=test DATABASE_URL=file:<bd.db> BB_FAKE_STORAGE=<carpeta> BB_TEST_CLOCK=1 PORT=3102 \
 *     pnpm --filter @beatbattle/server start
 *
 * Solo con el almacenamiento falso y una BD en fichero: nunca contra Cloudinary ni Turso.
 */
import { formatLocalDate, mondayOf, scheduleWeek, weekSlug as slugOf } from '@beatbattle/rules'
import { eq } from 'drizzle-orm'
import { buildApp } from '../app'
import { loadEnv } from '../config/env'
import { createDb } from '../db/client'
import { runMigrations } from '../db/migrate'
import { user } from '../db/schema'
import { createMemoryMailer } from '../email/mailer'
import { fixedClock } from '../lib/clock'
import { createDiskSampleStorage } from '../modules/storage/samples'

const [dbFile, storageDir, producersArg = '24', votersArg = '2'] = process.argv.slice(2)
if (!dbFile || !storageDir) throw new Error('Uso: seedBattle.ts <bd.db> <carpeta> [entradas] [votantes]')

const ORIGIN = 'http://localhost:5176'
const PASSWORD = 'lluvia en gràcia 92'
const MINUTE = 60_000
const HOUR = 60 * MINUTE

const config = loadEnv({
  NODE_ENV: 'test',
  DATABASE_URL: `file:${dbFile}`,
  BB_FAKE_STORAGE: storageDir,
  BB_PUBLIC_URL: ORIGIN,
  ALLOWED_ORIGINS: ORIGIN,
  LOG_LEVEL: 'warn',
})
const db = await createDb(config.databaseUrl, config.databaseAuthToken)
await runMigrations(db, config.migrationsDir)
const mailer = createMemoryMailer({ name: 'Beat Battle', address: 'batalla@example.com' })
const week = scheduleWeek(mondayOf(Date.now()))
const clock = fixedClock(week.startsAt - 24 * HOUR)
const app = buildApp({ config, db, clock, mailer })
await app.ready()
// El mismo almacenamiento falso que usará la API (lo que se escribe aquí lo sirve ella).
const files = createDiskSampleStorage({ root: storageDir, baseUrl: '', secret: config.auth.secret })

let ip = 1
async function account(username: string): Promise<{ id: string; cookie: string }> {
  const email = `${username}@example.com`
  ip += 1
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: { origin: ORIGIN },
    remoteAddress: `10.0.${Math.floor(ip / 250)}.${(ip % 250) + 1}`,
    payload: { email, password: PASSWORD, name: username, username, callbackURL: '/verificar' },
  })
  if (res.statusCode !== 200) throw new Error(`alta de ${username}: ${res.statusCode} ${res.body}`)
  const link = mailer.lastTo(email)?.text.match(/https?:\/\/\S+verify-email\?\S+/)?.[0]
  if (!link) throw new Error(`sin verificación para ${username}`)
  const url = new URL(link)
  const verified = await app.inject({ method: 'GET', url: url.pathname + url.search })
  const cookie = String(verified.headers['set-cookie'] ?? '').match(/bb\.session_token=[^;]+/)?.[0]
  if (!cookie) throw new Error(`sin sesión para ${username}`)
  return { id: (res.json() as { user: { id: string } }).user.id, cookie }
}

const json = (cookie: string) => ({ cookie, origin: ORIGIN, 'content-type': 'application/json' })
async function call(method: 'GET' | 'POST' | 'PUT', url: string, cookie: string, payload?: object) {
  const res = await app.inject({
    method,
    url,
    headers: payload ? json(cookie) : { cookie, origin: ORIGIN },
    ...(payload ? { payload } : {}),
  })
  if (res.statusCode >= 300) throw new Error(`${method} ${url}: ${res.statusCode} ${res.body}`)
  return res.body ? res.json().data : null
}

/** Un beat sintético: bombo a `bpm` y un acorde que respira, mono a 8 kHz (≈ 0,5 MB por cada 30 s). */
function beat(seconds: number, bpm: number, root: number, seed: number): Uint8Array {
  const rate = 8000
  const frames = Math.round(seconds * rate)
  const buffer = Buffer.alloc(44 + frames * 2)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + frames * 2, 4)
  buffer.write('WAVEfmt ', 8)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(rate, 24)
  buffer.writeUInt32LE(rate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(frames * 2, 40)
  const beatLen = (60 / bpm) * rate
  const level = 0.25 + (seed % 5) * 0.1
  for (let i = 0; i < frames; i++) {
    const inBeat = (i % beatLen) / rate
    const kick = Math.sin(2 * Math.PI * (55 + 80 * Math.exp(-inBeat * 30)) * inBeat) * Math.exp(-inBeat * 8)
    const bar = Math.floor(i / (beatLen * 4))
    const swell = 0.5 + 0.5 * Math.sin((2 * Math.PI * i) / (rate * (6 + (seed % 4))))
    const chord =
      (Math.sin((2 * Math.PI * root * i) / rate) + Math.sin((2 * Math.PI * root * 1.5 * i) / rate)) *
      0.25 *
      swell *
      (bar % 4 === 3 ? 0.4 : 1)
    const value = Math.max(-1, Math.min(1, (kick * 0.7 + chord) * level))
    buffer.writeInt16LE(Math.round(value * 32767), 44 + i * 2)
  }
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
}

const TITLES = [
  'Bruma en Gràcia',
  'Lluvia ácida',
  'Metro de madrugada',
  'Polígono norte',
  'Azotea 3AM',
  'Cassette roto',
  'Neón en el Raval',
  'Vinilo rayado',
  'Calor de agosto',
  'Último tren',
  'Sótano 808',
  'Humo y cristal',
  'Plaza vacía',
  'Ruta 66 bis',
  'Persiana bajada',
  'Eco del túnel',
  'Fiebre del sábado',
  'Cuarto oscuro',
  'Asfalto mojado',
  'Garaje sónico',
  'Faro apagado',
  'Patio interior',
  'Niebla en Montjuïc',
  'Sirena lejana',
]
const KEYS = ['Am', 'Dm', 'Em', 'Cm', 'Gm', 'F#m', 'C', 'G', 'F', 'A#m'] as const
const GENRES = ['Trap', 'Drill', 'Boom Bap', 'Jerk', 'Club', 'Reggaeton', 'Afrobeats', 'Amapiano'] as const

// La jefa y el sample.
const admin = await account('jefa')
await db.update(user).set({ role: 'admin' }).where(eq(user.id, admin.id))
const signPart = (part: string, sampleId?: string) =>
  call('POST', '/api/admin/samples/sign', admin.cookie, { part, ...(sampleId ? { sampleId } : {}) })
const original = await signPart('original')
await files.put({ publicId: original.upload.publicId, bytes: beat(20, 92, 147, 1), format: 'wav' })
const cover = await signPart('cover', original.sampleId)
const png = Buffer.alloc(33)
Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0)
png.writeUInt32BE(13, 8)
png.write('IHDR', 12)
png.writeUInt32BE(1200, 16)
png.writeUInt32BE(1200, 20)
await files.put({ publicId: cover.upload.publicId, bytes: new Uint8Array(png), format: 'png' })
const sample = await call('POST', '/api/admin/samples', admin.cookie, {
  sampleId: original.sampleId,
  title: 'Lluvia en Gràcia',
  credits: 'Other People Records',
  licenseText: 'Uso libre para la batalla.',
  bpm: 92,
  musicalKey: 'Dm',
  hasStems: false,
})
const monday = mondayOf(Date.now())
const weekSlug = slugOf(monday)
await call('POST', '/api/admin/weeks', admin.cookie, {
  monday: formatLocalDate(monday),
  sampleId: sample.id,
  challenge: 'Usa solo el primer compás',
})
clock.set(week.startsAt + HOUR)

// Los productores, cada uno con su entrada.
const producers: { id: string; cookie: string; entryId: string }[] = []
for (let i = 0; i < Number(producersArg); i++) {
  const who = await account(`prod${String(i + 1).padStart(2, '0')}`)
  await call('POST', `/api/weeks/${weekSlug}/rules`, who.cookie, { rulesVersion: 1 })
  const seconds = 31 + ((i * 7) % 30)
  const bpm = [140, 92, 128, 100, 150, 87, 120, 96][i % 8] as number
  const bytes = beat(seconds, bpm, 110 + ((i * 37) % 200), i)
  const signed = await call('POST', '/api/uploads/sign', who.cookie, {
    kind: 'entry',
    weekSlug,
    mime: 'audio/wav',
    bytes: bytes.byteLength,
    durationMs: seconds * 1000,
  })
  await files.put({ publicId: signed.publicId, bytes, format: 'wav', nowMs: clock.now() })
  const entry = await call('POST', `/api/weeks/${weekSlug}/entries`, who.cookie, {
    intentId: signed.intentId,
    title: TITLES[i % TITLES.length],
    bpm,
    musicalKey: KEYS[i % KEYS.length],
    daw: 'FL Studio',
    genres: [GENRES[i % GENRES.length]],
    description: null,
    declaration: true,
  })
  producers.push({ ...who, entryId: entry.id })
  clock.advance(17 * MINUTE)
  process.stdout.write(`entrada ${i + 1}/${producersArg}\r`)
}

// Los votantes escuchan y votan unas cuantas (cada uno, una parte distinta).
const voters: { id: string; cookie: string }[] = []
for (let v = 0; v < Number(votersArg); v++) voters.push(await account(`jurado${v + 1}`))
const everyone = [...voters, ...producers]
for (const [v, voter] of everyone.entries()) {
  const targets = producers.filter((p, i) => p.id !== voter.id && (i + v) % 3 === 0).slice(0, 6)
  for (const [k, target] of targets.entries()) {
    const { listenId } = await call('POST', `/api/entries/${target.entryId}/listen`, voter.cookie)
    clock.advance(31_000)
    await call('POST', `/api/entries/${target.entryId}/listen/qualify`, voter.cookie, { listenId })
    await call('PUT', `/api/entries/${target.entryId}/vote`, voter.cookie, { stars: ((v + k) % 5) + 1 })
  }
}

await app.close()
db.$client.close()
console.log(`\nSemana ${weekSlug}: ${producers.length} entradas, ${voters.length} votantes.`)
console.log(`Cuentas (contraseña «${PASSWORD}»): jefa (admin), jurado1…, prod01…`)
