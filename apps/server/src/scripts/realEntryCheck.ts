/**
 * Prueba real de la subida de una entrada contra Cloudinary (tarea 4.10, §4.8; `RF-STO-02`, `RF-STO-04`): con
 * la cuenta de BeatBattle y el prefijo de desarrollo, recorre lo que hacen el navegador y el servidor con un
 * audio de verdad, sobre la misma implementación que usa la API (`createCloudinaryEntryStorage`):
 *
 * 1. firma con `public_id` fijo y sin id de usuario (`video`/`authenticated`, `eager` MP3 asíncrono);
 * 2. subida por trozos de 20 MB con `X-Unique-Upload-Id` y `Content-Range`, como `chunkedUpload.ts`;
 * 3. verificación con la Admin API (carpeta, bytes, formato, fecha y `etag`);
 * 4. medición con ffmpeg leyendo el original por URL firmada temporal, validada con `validateEntryAudio`;
 * 5. escucha: el MP3 firmado `f_mp3,br_192k` responde 200 y es audio; el original sin firma, 401 o 404;
 * 6. borrado del recurso, y la Admin API ya no lo encuentra.
 *
 * Solo con un prefijo de desarrollo (nunca el de producción, `RF-STO-06`). Uso:
 *
 *   pnpm --filter @beatbattle/server exec tsx --env-file=.env src/scripts/realEntryCheck.ts <audio> [semana]
 */
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { entryFormatOf, validateEntryAudio } from '@beatbattle/rules'
import { ENTRY_CHUNK_BYTES } from '@beatbattle/shared'
import { PRODUCTION_PREFIX } from '../config/env'
import { createCloudinaryEntryStorage } from '../modules/storage/entries'

const [file, weekSlug = 'prueba-real'] = process.argv.slice(2)
if (!file) throw new Error('Uso: realEntryCheck.ts <audio> [semana]')

const cloudName = process.env.CLOUDINARY_CLOUD_NAME
const apiKey = process.env.CLOUDINARY_API_KEY
const apiSecret = process.env.CLOUDINARY_API_SECRET
const prefix = process.env.BB_CLOUDINARY_PREFIX ?? ''
if (!cloudName || !apiKey || !apiSecret) throw new Error('Faltan las credenciales de Cloudinary')
if (prefix === PRODUCTION_PREFIX || !prefix.startsWith(`${PRODUCTION_PREFIX}-dev`))
  throw new Error(`Solo con el prefijo de desarrollo (BB_CLOUDINARY_PREFIX=${prefix || '—'})`)

const storage = createCloudinaryEntryStorage({ cloudName, apiKey, apiSecret, prefix })
const report: Record<string, unknown> = {}
const t0 = Date.now()
const since = () => `${((Date.now() - t0) / 1000).toFixed(1)} s`
const step = (name: string, value: unknown) => {
  report[name] = value
  console.log(`[${since()}] ${name}:`, typeof value === 'string' ? value : JSON.stringify(value))
}

const bytes = await readFile(file)
const format = extname(file).slice(1).toLowerCase()
const intentId = randomUUID()
const publicId = storage.publicIdFor('entry', weekSlug, randomUUID())
step('fichero', { nombre: basename(file), bytes: bytes.length, formato: format })

// 1. Firma.
const intentAt = Date.now()
const signed = storage.sign({ kind: 'entry', publicId, intentId, nowMs: intentAt })
step('firma', { publicId, uploadUrl: signed.uploadUrl, eager: signed.fields.eager, type: signed.fields.type })
if (/user|usr/i.test(publicId)) throw new Error('El public_id lleva algo que parece un usuario')

let removed = false
try {
  // 2. Subida por trozos.
  const uniqueId = randomUUID()
  let last: Record<string, unknown> | null = null
  const chunks: string[] = []
  for (let start = 0; start < bytes.length; start += ENTRY_CHUNK_BYTES) {
    const end = Math.min(bytes.length, start + ENTRY_CHUNK_BYTES) - 1
    const body = new FormData()
    for (const [name, value] of Object.entries(signed.fields)) body.append(name, value)
    body.append('file', new Blob([bytes.subarray(start, end + 1)]), basename(file))
    const range = `bytes ${start}-${end}/${bytes.length}`
    const response = await fetch(signed.uploadUrl, {
      method: 'POST',
      body,
      headers: { 'X-Unique-Upload-Id': uniqueId, 'Content-Range': range },
    })
    const text = await response.text()
    if (!response.ok) throw new Error(`Trozo ${range}: ${response.status} ${text.slice(0, 300)}`)
    chunks.push(`${range} → ${response.status}`)
    last = JSON.parse(text) as Record<string, unknown>
  }
  step('subida', {
    trozos: chunks,
    eager: (last?.eager as unknown[] | undefined)?.length ?? 0,
    estado: last?.done,
  })

  // 3. Verificación con la Admin API.
  const asset = await storage.verify(publicId, 'entry')
  if (!asset) throw new Error('La Admin API no encuentra el recurso')
  step('verificación', {
    ...asset,
    enLaCarpeta: asset.publicId.startsWith(storage.folderOf('entry', weekSlug)),
    mismosBytes: asset.bytes === bytes.length,
    despuésDelIntent: asset.createdAtMs >= Math.floor(intentAt / 1000) * 1000,
  })

  // 4. Medición con la URL firmada temporal.
  const measureStart = Date.now()
  const measured = await storage.measure(publicId, asset.format)
  const problem = validateEntryAudio({
    format: entryFormatOf(`audio.${asset.format}`),
    sizeBytes: asset.bytes,
    durationMs: measured.durationMs,
  })
  step('medición', {
    duraciónMs: measured.durationMs,
    lufs: measured.integratedLufs,
    picoRealDb: measured.truePeakDb,
    bins: measured.peaks.length / 2,
    huella: measured.md5,
    bytesLeídos: measured.bytesRead,
    huellaCompleta: measured.bytesRead === asset.bytes,
    validación: problem ?? 'válido',
    tardóMs: Date.now() - measureStart,
  })

  // 5. Escucha: el derivado firmado (esperando al `eager` asíncrono) y el original sin firma.
  const streamUrl = storage.streamUrl(publicId)
  let stream: Response | null = null
  for (let tries = 0; tries < 30; tries++) {
    stream = await fetch(streamUrl)
    if (stream.ok) break
    await new Promise((wait) => setTimeout(wait, 4000))
  }
  const mp3 = stream?.ok ? new Uint8Array(await stream.arrayBuffer()) : null
  step('escucha firmada', {
    status: stream?.status,
    tipo: stream?.headers.get('content-type'),
    bytes: mp3?.length ?? 0,
    transformación: streamUrl.includes('f_mp3,br_192k'),
    firmada: /\/s--[\w-]+--\//.test(streamUrl),
  })
  const unsigned = `https://res.cloudinary.com/${cloudName}/video/authenticated/${publicId}.${asset.format}`
  const plain = await fetch(unsigned)
  const unsignedMp3 = await fetch(
    `https://res.cloudinary.com/${cloudName}/video/authenticated/f_mp3,br_192k/${publicId}.mp3`,
  )
  const publicType = await fetch(
    `https://res.cloudinary.com/${cloudName}/video/upload/${publicId}.${asset.format}`,
  )
  step('sin firma', {
    original: plain.status,
    mp3SinFirma: unsignedMp3.status,
    comoPúblico: publicType.status,
  })
} finally {
  // 6. Borrado.
  await storage.remove(publicId, 'entry')
  removed = (await storage.verify(publicId, 'entry')) === null
  step('borrado', { borrado: removed })
}
console.log(`\n[${since()}] fin`)
console.log(JSON.stringify(report, null, 2))
