import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { v2 as cloudinary } from 'cloudinary'
import type { StorageConfig } from '../../config/env'
import { type SignedUpload, STREAM_TRANSFORMATION } from './cloudinary'

/**
 * Almacenamiento de los samples (guía §4.8, §2.4; tarea 3.4): la parte de `AudioStorage` (§4.8.6) que
 * necesitan. Tres recursos por sample, con el `public_id` fijo de §4.8.1:
 *
 * | Parte | Cloudinary | `public_id` |
 * |---|---|---|
 * | original | `video` / `authenticated` (WAV o AIFF ≤ 100 MiB, con el MP3 de escucha en `eager`) | `<prefijo>/samples/<id>/original` |
 * | stems | `raw` / `authenticated` (zip ≤ 10 MB) | `<prefijo>/samples/<id>/stems.zip` |
 * | cover | `image` / `upload` (≥ 1000 px) | `<prefijo>/samples/<id>/cover` |
 *
 * Los `raw` llevan la extensión en el `public_id` (Cloudinary no separa su formato), así la descarga sale
 * como `.zip`. El audio nunca pasa por la API: el navegador sube directo con la firma, y el servidor
 * verifica con la Admin API y mide leyendo el original por URL firmada.
 *
 * Hay dos implementaciones con la misma API: Cloudinary (la única del lanzamiento) y una falsa en disco
 * para los E2E (`createDiskSampleStorage`), que no toca la red.
 */

export const SAMPLE_PARTS = ['original', 'stems', 'cover'] as const
export type SamplePart = (typeof SAMPLE_PARTS)[number]

/** Formatos que se aceptan al subir cada parte. */
export const SAMPLE_FORMATS: Record<SamplePart, readonly string[]> = {
  original: ['wav', 'aiff', 'aif'],
  stems: ['zip'],
  cover: ['png', 'jpg', 'jpeg', 'webp'],
}

/** Tamaños máximos (§2.4): 100 MiB el original y 10 MB los stems (límite de Cloudinary para `raw`). */
export const SAMPLE_MAX_BYTES: Record<SamplePart, number> = {
  original: 100 * 1024 * 1024,
  stems: 10 * 1000 * 1000,
  cover: 20 * 1000 * 1000,
}

/** Lado mínimo de la portada (§2.4). */
export const SAMPLE_COVER_MIN_PX = 1000

/** Lo que dice el almacenamiento de un recurso ya subido. */
export interface SampleAsset {
  publicId: string
  format: string
  bytes: number
  /** Solo la portada. */
  width?: number
  height?: number
}

export interface SampleStorage {
  readonly prefix: string
  publicIdFor(sampleId: string, part: SamplePart): string
  /** Parámetros firmados para que el navegador suba la parte directamente. */
  sign(input: { sampleId: string; part: SamplePart; nowMs: number }): SignedUpload
  /** Admin API: el recurso, o `null` si no existe. */
  verify(publicId: string, part: SamplePart): Promise<SampleAsset | null>
  /** El original, para medirlo (§4.8.4). */
  openOriginal(publicId: string, format: string): Promise<ReadableStream<Uint8Array>>
  /** MP3 de escucha firmado (`RF-DROP-09`): la única forma de oír el sample sin descargarlo. */
  streamUrl(publicId: string): string
  /**
   * Descarga como adjunto que caduca en `expiresAtMs` (`RF-DROP-07`). En Cloudinary es la API de descarga
   * privada (`private_download_url`, con `attachment` y `expires_at`): una URL de entrega firmada no caduca
   * (`expires_at` solo vale con autenticación por token, de pago).
   */
  downloadUrl(
    publicId: string,
    part: 'original' | 'stems',
    input: { format: string; expiresAtMs: number },
  ): string
  /** Portada recortada a cuadrado de `size` px. */
  coverUrl(publicId: string, size: number): string
  remove(publicId: string, part: SamplePart): Promise<void>
}

const RESOURCE: Record<
  SamplePart,
  { resourceType: 'video' | 'raw' | 'image'; type: 'authenticated' | 'upload' }
> = {
  original: { resourceType: 'video', type: 'authenticated' },
  stems: { resourceType: 'raw', type: 'authenticated' },
  cover: { resourceType: 'image', type: 'upload' },
}

function publicIdFor(prefix: string, sampleId: string, part: SamplePart): string {
  return `${prefix}/samples/${sampleId}/${part === 'stems' ? 'stems.zip' : part}`
}

// ─── Cloudinary ─────────────────────────────────────────────────────────────────────────────────

export function createCloudinarySampleStorage(config: StorageConfig): SampleStorage {
  const credentials = { cloud_name: config.cloudName, api_key: config.apiKey, api_secret: config.apiSecret }
  return {
    prefix: config.prefix,
    publicIdFor: (sampleId, part) => publicIdFor(config.prefix, sampleId, part),
    sign({ sampleId, part, nowMs }) {
      const { resourceType, type } = RESOURCE[part]
      const publicId = publicIdFor(config.prefix, sampleId, part)
      const params: Record<string, string> = {
        public_id: publicId,
        timestamp: String(Math.floor(nowMs / 1000)),
        type,
        allowed_formats: SAMPLE_FORMATS[part].join(','),
        overwrite: 'true',
        invalidate: 'true',
        tags: 'bb,sample',
      }
      if (part === 'original') {
        params.eager = STREAM_TRANSFORMATION
        params.eager_async = 'true'
      }
      const signature = cloudinary.utils.api_sign_request(params, config.apiSecret)
      return {
        uploadUrl: `https://api.cloudinary.com/v1_1/${config.cloudName}/${resourceType}/upload`,
        publicId,
        fields: { ...params, signature, api_key: config.apiKey },
      }
    },
    async verify(publicId, part) {
      const { resourceType, type } = RESOURCE[part]
      try {
        const resource = await cloudinary.api.resource(publicId, {
          ...credentials,
          resource_type: resourceType,
          type,
        })
        return {
          publicId: resource.public_id,
          format: resource.format ?? publicId.split('.').pop() ?? '',
          bytes: resource.bytes,
          width: resource.width,
          height: resource.height,
        }
      } catch (error) {
        if ((error as { error?: { http_code?: number } }).error?.http_code === 404) return null
        throw error
      }
    },
    async openOriginal(publicId, format) {
      const url = cloudinary.url(publicId, {
        ...credentials,
        resource_type: 'video',
        type: 'authenticated',
        sign_url: true,
        secure: true,
        format,
        urlAnalytics: false,
      })
      const response = await fetch(url)
      if (!response.ok || !response.body)
        throw new Error(`Cloudinary respondió ${response.status} al leer el original`)
      return response.body
    },
    streamUrl(publicId) {
      return cloudinary.url(publicId, {
        ...credentials,
        resource_type: 'video',
        type: 'authenticated',
        sign_url: true,
        secure: true,
        raw_transformation: STREAM_TRANSFORMATION,
        format: 'mp3',
        urlAnalytics: false,
      })
    },
    downloadUrl(publicId, part, { format, expiresAtMs }) {
      const { resourceType } = RESOURCE[part]
      return cloudinary.utils.private_download_url(publicId, part === 'stems' ? '' : format, {
        ...credentials,
        resource_type: resourceType,
        type: 'authenticated',
        attachment: true,
        expires_at: Math.floor(expiresAtMs / 1000),
      })
    },
    coverUrl(publicId, size) {
      return cloudinary.url(publicId, {
        cloud_name: config.cloudName,
        resource_type: 'image',
        type: 'upload',
        secure: true,
        transformation: [
          { crop: 'fill', gravity: 'auto', width: size, height: size },
          { fetch_format: 'auto', quality: 'auto' },
        ],
        urlAnalytics: false,
      })
    },
    async remove(publicId, part) {
      const { resourceType, type } = RESOURCE[part]
      await cloudinary.uploader.destroy(publicId, {
        ...credentials,
        resource_type: resourceType,
        type,
        invalidate: true,
      })
    },
  }
}

// ─── Falso en disco (E2E y desarrollo sin Cloudinary) ───────────────────────────────────────────

/** Metadatos que el almacenamiento falso guarda junto a cada fichero. */
export interface DiskMeta {
  format: string
  bytes: number
  width?: number
  height?: number
  /** MD5 del contenido, como el `etag` de Cloudinary (`RF-ENT-11`). */
  etag?: string
  /** Cuándo se subió (ms UTC), como `created_at` de la Admin API. */
  createdAtMs?: number
  /** Duración de un WAV leída de su cabecera (Cloudinary la da de cualquier audio). */
  durationMs?: number
}

/** Duración de un WAV PCM por su cabecera (`fmt ` y `data`), o `undefined` si no es un WAV legible. */
export function wavDurationMs(bytes: Uint8Array): number | undefined {
  const view = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.length < 12 || view.toString('ascii', 0, 4) !== 'RIFF' || view.toString('ascii', 8, 12) !== 'WAVE')
    return undefined
  let offset = 12
  let byteRate = 0
  while (offset + 8 <= view.length) {
    const id = view.toString('ascii', offset, offset + 4)
    const size = view.readUInt32LE(offset + 4)
    if (id === 'fmt ' && offset + 16 <= view.length) byteRate = view.readUInt32LE(offset + 16)
    if (id === 'data') return byteRate > 0 ? Math.round((size / byteRate) * 1000) : undefined
    offset += 8 + size + (size % 2)
  }
  return undefined
}

export interface DiskSampleStorage extends SampleStorage {
  readonly root: string
  /** Origen de las URLs de las rutas de prueba (`''`: el mismo de la API). */
  readonly baseUrl: string
  /** Firma de una subida (`public_id`, `timestamp` y formatos permitidos), como la de Cloudinary. */
  signUpload(publicId: string, timestamp: string, allowedFormats: string): string
  /** Guarda una parte como si la hubiera subido el navegador (lo usan la ruta de subida y los tests). */
  put(input: { publicId: string; bytes: Uint8Array; format: string; nowMs?: number }): Promise<DiskMeta>
  /** Lee una parte guardada, o `null`. */
  read(publicId: string): Promise<{ bytes: Uint8Array; meta: DiskMeta } | null>
  /** Comprueba la firma de una subida o de una URL del almacenamiento falso. */
  checkSignature(payload: string, signature: string): boolean
  sign(input: { sampleId: string; part: SamplePart; nowMs: number }): SignedUpload
  /** Firma de una URL de entrega o descarga (`publicId` + caducidad). */
  signUrl(publicId: string, expiresAtMs: number | null): string
}

/** Ancho y alto de un PNG o un JPEG (lo que suben los E2E), o `undefined`. */
export function imageSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  const view = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.length >= 24 && view.readUInt32BE(0) === 0x89504e47) {
    return { width: view.readUInt32BE(16), height: view.readUInt32BE(20) }
  }
  if (view.length >= 4 && view[0] === 0xff && view[1] === 0xd8) {
    let offset = 2
    while (offset + 9 < view.length) {
      if (view[offset] !== 0xff) return undefined
      const marker = view[offset + 1] as number
      const length = view.readUInt16BE(offset + 2)
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: view.readUInt16BE(offset + 5), width: view.readUInt16BE(offset + 7) }
      }
      offset += 2 + length
    }
  }
  return undefined
}

/**
 * Almacenamiento falso en `root` con la misma API (§4.8.6). Las URLs apuntan a las rutas de prueba de
 * `fakeStorageRoutes` (`/api/test/storage/*`) bajo `baseUrl`, firmadas con HMAC: subir, oír (el original
 * tal cual: el navegador lo reproduce) y descargar como adjunto con caducidad.
 */
export function createDiskSampleStorage(input: {
  root: string
  baseUrl: string
  secret: string
  prefix?: string
}): DiskSampleStorage {
  const root = resolve(input.root)
  const prefix = input.prefix ?? 'beatbattle-test'
  const hmac = (payload: string) => createHmac('sha256', input.secret).update(payload).digest('base64url')
  const pathOf = (publicId: string) => {
    const path = resolve(root, publicId)
    if (!path.startsWith(root + sep)) throw new Error(`public_id fuera del almacenamiento: ${publicId}`)
    return path
  }
  const storage: DiskSampleStorage = {
    root,
    baseUrl: input.baseUrl,
    prefix,
    signUpload: (publicId, timestamp, allowedFormats) => hmac(`${publicId}|${timestamp}|${allowedFormats}`),
    publicIdFor: (sampleId, part) => publicIdFor(prefix, sampleId, part),
    checkSignature(payload, signature) {
      const expected = Buffer.from(hmac(payload))
      const given = Buffer.from(signature)
      return expected.length === given.length && timingSafeEqual(expected, given)
    },
    signUrl(publicId, expiresAtMs) {
      const expires = expiresAtMs === null ? '' : String(expiresAtMs)
      return `sig=${hmac(`${publicId}|${expires}`)}${expires ? `&expires=${expires}` : ''}`
    },
    sign({ sampleId, part, nowMs }) {
      const publicId = publicIdFor(prefix, sampleId, part)
      const fields = {
        public_id: publicId,
        timestamp: String(Math.floor(nowMs / 1000)),
        allowed_formats: SAMPLE_FORMATS[part].join(','),
      }
      return {
        uploadUrl: `${input.baseUrl}/api/test/storage/upload`,
        publicId,
        fields: {
          ...fields,
          signature: storage.signUpload(fields.public_id, fields.timestamp, fields.allowed_formats),
        },
      }
    },
    async put({ publicId, bytes, format, nowMs }) {
      const path = pathOf(publicId)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, bytes)
      const meta: DiskMeta = {
        format,
        bytes: bytes.byteLength,
        ...imageSize(bytes),
        etag: createHash('md5').update(bytes).digest('hex'),
        ...(nowMs === undefined ? {} : { createdAtMs: nowMs }),
        ...(format === 'wav' ? { durationMs: wavDurationMs(bytes) } : {}),
      }
      await writeFile(`${path}.meta.json`, JSON.stringify(meta))
      return meta
    },
    async read(publicId) {
      const path = pathOf(publicId)
      try {
        const [bytes, meta] = await Promise.all([readFile(path), readFile(`${path}.meta.json`, 'utf8')])
        return { bytes: new Uint8Array(bytes), meta: JSON.parse(meta) as DiskMeta }
      } catch {
        return null
      }
    },
    async verify(publicId) {
      const path = pathOf(publicId)
      try {
        await stat(path)
        const meta = JSON.parse(await readFile(`${path}.meta.json`, 'utf8')) as DiskMeta
        return { publicId, format: meta.format, bytes: meta.bytes, width: meta.width, height: meta.height }
      } catch {
        return null
      }
    },
    async openOriginal(publicId) {
      const found = await storage.read(publicId)
      if (!found) throw new Error(`No existe ${publicId}`)
      const { bytes } = found
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes)
          controller.close()
        },
      })
    },
    streamUrl(publicId) {
      return `${input.baseUrl}/api/test/storage/stream/${publicId}?${storage.signUrl(publicId, null)}`
    },
    downloadUrl(publicId, _part, { expiresAtMs }) {
      return `${input.baseUrl}/api/test/storage/download/${publicId}?${storage.signUrl(publicId, expiresAtMs)}&attachment=true`
    },
    coverUrl(publicId) {
      return `${input.baseUrl}/api/test/storage/stream/${publicId}?${storage.signUrl(publicId, null)}`
    },
    async remove(publicId) {
      const path = pathOf(publicId)
      await rm(path, { force: true })
      await rm(`${path}.meta.json`, { force: true })
    },
  }
  return storage
}

/** Ruta del almacenamiento falso por defecto (fuera de `src`, ignorada por git). */
export const DEFAULT_DISK_STORAGE_ROOT = join('data', 'fake-storage')
