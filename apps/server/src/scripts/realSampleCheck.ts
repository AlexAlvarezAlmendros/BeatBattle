/**
 * Prueba real del almacenamiento de los samples contra Cloudinary (tarea 3.4, §4.8; `RF-DROP-07`,
 * `RF-DROP-09`, `RF-STO-01..03`): con la cuenta de BeatBattle y el prefijo de desarrollo, sobre la misma
 * implementación que usa la API (`createCloudinarySampleStorage`):
 *
 * 1. el original (`video`/`authenticated`), los *stems* (`raw`/`authenticated`) y la portada (`image`/`upload`)
 *    suben con su firma y su `public_id` fijo `<prefijo>/samples/<id>/…`;
 * 2. la Admin API los encuentra (la portada, con su tamaño);
 * 3. el original se lee por URL firmada y se mide con ffmpeg;
 * 4. la escucha: el MP3 firmado responde 200 y es audio; el original sin firma, 401 o 404;
 * 5. la descarga como adjunto (`private_download_url`) funciona antes de caducar y deja de funcionar después
 *    (con una caducidad corta para no esperar una hora: el mecanismo es el mismo `expires_at`);
 * 6. la portada pública recortada responde 200;
 * 7. se borra todo y la Admin API ya no lo encuentra.
 *
 * Solo con un prefijo de desarrollo (nunca el de producción, `RF-STO-06`). Uso:
 *
 *   pnpm --filter @beatbattle/server exec tsx --env-file=<.env> src/scripts/realSampleCheck.ts \
 *     <original.wav> <stems.zip> <portada.png> [segundos de caducidad]
 */
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { PRODUCTION_PREFIX } from '../config/env'
import { measureAudio } from '../media/measure'
import { createCloudinarySampleStorage, type SamplePart } from '../modules/storage/samples'

const [originalFile, stemsFile, coverFile, ttlArg = '45'] = process.argv.slice(2)
if (!originalFile || !stemsFile || !coverFile)
  throw new Error('Uso: realSampleCheck.ts <original.wav> <stems.zip> <portada.png> [segundos]')

const cloudName = process.env.CLOUDINARY_CLOUD_NAME
const apiKey = process.env.CLOUDINARY_API_KEY
const apiSecret = process.env.CLOUDINARY_API_SECRET
const prefix = process.env.BB_CLOUDINARY_PREFIX ?? ''
if (!cloudName || !apiKey || !apiSecret) throw new Error('Faltan las credenciales de Cloudinary')
if (prefix === PRODUCTION_PREFIX || !prefix.startsWith(`${PRODUCTION_PREFIX}-dev`))
  throw new Error(`Solo con el prefijo de desarrollo (BB_CLOUDINARY_PREFIX=${prefix || '—'})`)

const storage = createCloudinarySampleStorage({ cloudName, apiKey, apiSecret, prefix })
const sampleId = `prueba-real-3-4-${randomUUID().slice(0, 8)}`
const report: Record<string, unknown> = {}
const t0 = Date.now()
const since = () => `${((Date.now() - t0) / 1000).toFixed(1)} s`
const step = (name: string, value: unknown) => {
  report[name] = value
  console.log(`[${since()}] ${name}:`, JSON.stringify(value))
}
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Sube una parte como el panel de admin: un POST firmado directo a Cloudinary. */
async function upload(part: SamplePart, file: string): Promise<string> {
  const signed = storage.sign({ sampleId, part, nowMs: Date.now() })
  const body = new FormData()
  for (const [name, value] of Object.entries(signed.fields)) body.append(name, value)
  body.append('file', new Blob([await readFile(file)]), basename(file))
  const response = await fetch(signed.uploadUrl, { method: 'POST', body })
  if (!response.ok) throw new Error(`${part}: ${response.status} ${(await response.text()).slice(0, 300)}`)
  return signed.publicId
}

const uploaded: [string, SamplePart][] = []
try {
  // 1. Subidas.
  for (const [part, file] of [
    ['original', originalFile],
    ['stems', stemsFile],
    ['cover', coverFile],
  ] as const) {
    const publicId = await upload(part, file)
    uploaded.push([publicId, part])
  }
  step('subidas', uploaded)

  // 2. Admin API.
  const assets = Object.fromEntries(
    await Promise.all(uploaded.map(async ([publicId, part]) => [part, await storage.verify(publicId, part)])),
  )
  step('verificación', assets)
  const [originalId] = uploaded[0] as [string, SamplePart]
  const [stemsId] = uploaded[1] as [string, SamplePart]
  const [coverId] = uploaded[2] as [string, SamplePart]
  const format = assets.original?.format || extname(originalFile).slice(1)

  // 3. Medición.
  const measured = await measureAudio(await storage.openOriginal(originalId, format))
  step('medición', {
    duraciónMs: measured.durationMs,
    lufs: measured.integratedLufs,
    picoRealDb: measured.truePeakDb,
    bytesLeídos: measured.bytesRead,
  })

  // 4. Escucha (esperando al `eager` asíncrono) y el original sin firma.
  let stream: Response | null = null
  for (let tries = 0; tries < 30; tries++) {
    stream = await fetch(storage.streamUrl(originalId))
    if (stream.ok) break
    await wait(4000)
  }
  const mp3 = stream?.ok ? (await stream.arrayBuffer()).byteLength : 0
  const unsigned = await fetch(
    `https://res.cloudinary.com/${cloudName}/video/authenticated/${originalId}.${format}`,
  )
  step('escucha', {
    firmada: stream?.status,
    tipo: stream?.headers.get('content-type'),
    bytes: mp3,
    sinFirma: unsigned.status,
  })

  // 5. Descarga como adjunto, antes y después de caducar.
  const ttlMs = Number(ttlArg) * 1000
  const expiresAtMs = Date.now() + ttlMs
  const originalUrl = storage.downloadUrl(originalId, 'original', { format, expiresAtMs })
  const stemsUrl = storage.downloadUrl(stemsId, 'stems', { format: 'zip', expiresAtMs })
  const before = await Promise.all(
    [originalUrl, stemsUrl].map(async (url) => {
      const response = await fetch(url)
      const bytes = response.ok ? (await response.arrayBuffer()).byteLength : 0
      return {
        status: response.status,
        disposición: response.headers.get('content-disposition'),
        bytes,
      }
    }),
  )
  step('descarga antes de caducar', { original: before[0], stems: before[1], caducaEnS: ttlMs / 1000 })
  await wait(Math.max(0, expiresAtMs - Date.now()) + 15_000)
  const after = await Promise.all([originalUrl, stemsUrl].map(async (url) => (await fetch(url)).status))
  step('descarga caducada', { original: after[0], stems: after[1] })

  // 6. Portada pública recortada.
  const cover = await fetch(storage.coverUrl(coverId, 512))
  step('portada', { status: cover.status, tipo: cover.headers.get('content-type') })
} finally {
  // 7. Borrado.
  const gone: Record<string, boolean> = {}
  for (const [publicId, part] of uploaded) {
    await storage.remove(publicId, part)
    gone[part] = (await storage.verify(publicId, part)) === null
  }
  step('borrado', gone)
}
console.log(`\n[${since()}] fin`)
console.log(JSON.stringify(report, null, 2))
