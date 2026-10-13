/**
 * Prueba real del reproductor global sobre Cloudinary (tarea 5.23; `RF-PLAY-02`, `RF-PLAY-03`, `RD-MOT-06`,
 * §4.7.3, §4.8): sube un audio como entrada al prefijo de desarrollo (firma y Admin API, como la 4.10), espera
 * el MP3 firmado `f_mp3,br_192k` y lo reproduce en Chrome con el reproductor de la web en desarrollo
 * (`tools/shot/real-player.mjs`): suena, la ganancia baja lo que toca, el analizador lee el audio de otro
 * origen (con `crossOrigin`) salvo como entrada ciega, y la Media Session lleva título y artista. Al final borra
 * el recurso y comprueba que la Admin API ya no lo encuentra.
 *
 * Solo con un prefijo de desarrollo (nunca el de producción, `RF-STO-06`) y con la web en marcha (`pnpm dev`).
 * Crea y borra un recurso en Cloudinary: se ejecuta con la confirmación del usuario. Uso:
 *
 *   pnpm --filter @beatbattle/server exec tsx --env-file=<.env> src/scripts/realPlayerCheck.ts <audio> [web]
 */
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { PRODUCTION_PREFIX } from '../config/env'
import { createCloudinaryEntryStorage } from '../modules/storage/entries'

const [file, web = 'http://localhost:5173'] = process.argv.slice(2)
if (!file) throw new Error('Uso: realPlayerCheck.ts <audio> [web]')

const cloudName = process.env.CLOUDINARY_CLOUD_NAME
const apiKey = process.env.CLOUDINARY_API_KEY
const apiSecret = process.env.CLOUDINARY_API_SECRET
const prefix = process.env.BB_CLOUDINARY_PREFIX ?? ''
if (!cloudName || !apiKey || !apiSecret) throw new Error('Faltan las credenciales de Cloudinary')
if (prefix === PRODUCTION_PREFIX || !prefix.startsWith(`${PRODUCTION_PREFIX}-dev`))
  throw new Error(`Solo con el prefijo de desarrollo (BB_CLOUDINARY_PREFIX=${prefix || '—'})`)

const storage = createCloudinaryEntryStorage({ cloudName, apiKey, apiSecret, prefix })
const publicId = storage.publicIdFor('entry', 'prueba-real-5-23', randomUUID())
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const log = (name: string, value: unknown) => console.log(`${name}:`, JSON.stringify(value))

let uploaded = false
try {
  const bytes = await readFile(file)
  const signed = storage.sign({ kind: 'entry', publicId, intentId: randomUUID(), nowMs: Date.now() })
  const body = new FormData()
  for (const [name, value] of Object.entries(signed.fields)) body.append(name, value)
  body.append('file', new Blob([bytes]), basename(file))
  const response = await fetch(signed.uploadUrl, { method: 'POST', body })
  if (!response.ok) throw new Error(`subida: ${response.status} ${(await response.text()).slice(0, 300)}`)
  uploaded = true
  log('subida', { publicId, bytes: bytes.length })
  const asset = await storage.verify(publicId, 'entry')
  if (!asset) throw new Error('La Admin API no encuentra el recurso')
  log('verificación', { formato: asset.format, bytes: asset.bytes })

  // El MP3 de escucha (el `eager` es asíncrono).
  const streamUrl = storage.streamUrl(publicId)
  let ready = false
  for (let tries = 0; tries < 30 && !ready; tries++) {
    ready = (await fetch(streamUrl, { method: 'HEAD' })).ok
    if (!ready) await wait(4000)
  }
  if (!ready) throw new Error('El MP3 firmado no llega')
  log('escucha', { firmada: /\/s--[\w-]+--\//.test(streamUrl), mp3: streamUrl.includes('f_mp3,br_192k') })

  // El navegador: el reproductor de la web con ese MP3.
  const script = join(process.cwd(), '../../tools/shot/real-player.mjs')
  const out = execFileSync('node', [script, web, streamUrl], { encoding: 'utf8' })
  console.log(out.trim())
} finally {
  if (uploaded) {
    await storage.remove(publicId, 'entry')
    log('borrado', { publicId, ya: (await storage.verify(publicId, 'entry')) === null })
  }
}
