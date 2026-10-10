import { readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { v2 as cloudinary } from 'cloudinary'
import type { StorageConfig } from '../../config/env'
import { type AudioMeasurement, measureAudio } from '../../media/measure'
import { type SignedUpload, STREAM_TRANSFORMATION } from './cloudinary'
import type { DiskMeta, DiskSampleStorage } from './samples'

/**
 * Almacenamiento de las entradas (guía §4.8, §4.8.6 `AudioStorage`; tarea 4.4): el audio y la portada
 * propia, los dos `authenticated` (`RF-STO-02`, `RF-ENT-10`), con el `public_id` que fija el servidor y sin
 * el id del usuario (`RF-ENT-04`):
 *
 * | Recurso | Cloudinary | `public_id` |
 * |---|---|---|
 * | audio | `video` / `authenticated` (WAV, AIFF, FLAC o MP3; MP3 de escucha en `eager` asíncrono) | `<prefijo>/entries/<semana>/<uuid>` |
 * | portada | `image` / `authenticated` | `<prefijo>/entry-covers/<semana>/<uuid>` |
 *
 * El navegador sube por trozos directo a Cloudinary (§4.7.4) con una sola firma; el servidor verifica con
 * la Admin API (carpeta, bytes, formato, duración, fecha y `etag`) y mide leyendo el original por URL
 * firmada (§4.8.4). Dos implementaciones con la misma API: Cloudinary y la falsa en disco de los E2E.
 */

export const ENTRY_ASSET_KINDS = ['entry', 'entryCover'] as const
export type EntryAssetKind = (typeof ENTRY_ASSET_KINDS)[number]

/** Formatos que se aceptan al subir (el original se valida además con `validateEntryAudio`). */
export const ENTRY_UPLOAD_FORMATS: Record<EntryAssetKind, readonly string[]> = {
  entry: ['wav', 'aiff', 'aif', 'flac', 'mp3'],
  entryCover: ['png', 'jpg', 'jpeg', 'webp'],
}

const FOLDER: Record<EntryAssetKind, string> = { entry: 'entries', entryCover: 'entry-covers' }

const RESOURCE: Record<EntryAssetKind, 'video' | 'image'> = { entry: 'video', entryCover: 'image' }

/** Lo que dice el almacenamiento de un recurso ya subido (Admin API). */
export interface EntryAsset {
  publicId: string
  format: string
  bytes: number
  /** MD5 del fichero: dos subidas del mismo audio dan el mismo (`RF-ENT-11`). */
  etag: string
  /** Cuándo se subió, ms UTC: tiene que ser posterior al *intent* (§4.8.4). */
  createdAtMs: number
  /** Duración del audio; `null` en una imagen o si el almacenamiento no la sabe (se mide con ffmpeg). */
  durationMs: number | null
  width?: number
  height?: number
}

/** Un recurso del barrido de huérfanos (§4.8.5). */
export interface ListedAsset {
  publicId: string
  kind: EntryAssetKind
  createdAtMs: number
}

/** Consumo de la cuenta (para el panel de la Fase 10, `RF-ADM-04`). */
export interface StorageUsage {
  storageBytes: number
  bandwidthBytes: number
  transformations: number
}

export interface EntryStorage {
  readonly prefix: string
  /** Carpeta de un tipo de recurso de una semana (`<prefijo>/entries/2026-w41/`). */
  folderOf(kind: EntryAssetKind, weekSlug: string): string
  publicIdFor(kind: EntryAssetKind, weekSlug: string, id: string): string
  /** Parámetros firmados para subir el recurso (por trozos), con las etiquetas `bb` e `intent:<id>`. */
  sign(input: { kind: EntryAssetKind; publicId: string; intentId: string; nowMs: number }): SignedUpload
  /** Admin API: el recurso, o `null` si no existe. */
  verify(publicId: string, kind: EntryAssetKind): Promise<EntryAsset | null>
  /** Sonoridad, pico real, duración y onda medidas en el servidor (§4.8.4, `RF-STO-04`). */
  measure(publicId: string, format: string): Promise<AudioMeasurement>
  /** MP3 de escucha firmado (§4.8.3): nunca el `public_id` en crudo. */
  streamUrl(publicId: string): string
  /** Portada propia firmada, recortada a cuadrado de `size` px. */
  coverUrl(publicId: string, size: number): string
  remove(publicId: string, kind: EntryAssetKind): Promise<void>
  /** Una página del barrido por prefijo (§4.8.5); `cursor` para seguir. */
  listByPrefix(
    kind: EntryAssetKind,
    cursor: string | null,
  ): Promise<{ items: ListedAsset[]; next: string | null }>
  usage(): Promise<StorageUsage>
}

export type MeasureFn = (source: ReadableStream<Uint8Array>) => Promise<AudioMeasurement>

function folderOf(prefix: string, kind: EntryAssetKind, weekSlug: string): string {
  return `${prefix}/${FOLDER[kind]}/${weekSlug}/`
}

// ─── Cloudinary ─────────────────────────────────────────────────────────────────────────────────

export function createCloudinaryEntryStorage(
  config: StorageConfig,
  measure: MeasureFn = (source) => measureAudio(source),
): EntryStorage {
  const credentials = { cloud_name: config.cloudName, api_key: config.apiKey, api_secret: config.apiSecret }
  const storage: EntryStorage = {
    prefix: config.prefix,
    folderOf: (kind, weekSlug) => folderOf(config.prefix, kind, weekSlug),
    publicIdFor: (kind, weekSlug, id) => `${folderOf(config.prefix, kind, weekSlug)}${id}`,
    sign({ kind, publicId, intentId, nowMs }) {
      const params: Record<string, string> = {
        public_id: publicId,
        timestamp: String(Math.floor(nowMs / 1000)),
        type: 'authenticated',
        allowed_formats: ENTRY_UPLOAD_FORMATS[kind].join(','),
        tags: `bb,${kind},intent:${intentId}`,
      }
      if (kind === 'entry') {
        params.eager = STREAM_TRANSFORMATION
        params.eager_async = 'true'
      }
      const signature = cloudinary.utils.api_sign_request(params, config.apiSecret)
      return {
        uploadUrl: `https://api.cloudinary.com/v1_1/${config.cloudName}/${RESOURCE[kind]}/upload`,
        publicId,
        fields: { ...params, signature, api_key: config.apiKey },
      }
    },
    async verify(publicId, kind) {
      try {
        const resource = await cloudinary.api.resource(publicId, {
          ...credentials,
          resource_type: RESOURCE[kind],
          type: 'authenticated',
        })
        return {
          publicId: resource.public_id,
          format: resource.format ?? '',
          bytes: resource.bytes,
          etag: resource.etag ?? '',
          createdAtMs: Date.parse(resource.created_at),
          durationMs: typeof resource.duration === 'number' ? Math.round(resource.duration * 1000) : null,
          width: resource.width,
          height: resource.height,
        }
      } catch (error) {
        if ((error as { error?: { http_code?: number } }).error?.http_code === 404) return null
        throw error
      }
    },
    async measure(publicId, format) {
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
      return measure(response.body)
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
    coverUrl(publicId, size) {
      return cloudinary.url(publicId, {
        ...credentials,
        resource_type: 'image',
        type: 'authenticated',
        sign_url: true,
        secure: true,
        transformation: [
          { crop: 'fill', gravity: 'auto', width: size, height: size },
          { fetch_format: 'auto', quality: 'auto' },
        ],
        urlAnalytics: false,
      })
    },
    async remove(publicId, kind) {
      await cloudinary.uploader.destroy(publicId, {
        ...credentials,
        resource_type: RESOURCE[kind],
        type: 'authenticated',
        invalidate: true,
      })
    },
    async listByPrefix(kind, cursor) {
      const page = await cloudinary.api.resources({
        ...credentials,
        resource_type: RESOURCE[kind],
        type: 'authenticated',
        prefix: `${config.prefix}/${FOLDER[kind]}/`,
        max_results: 500,
        ...(cursor ? { next_cursor: cursor } : {}),
      })
      return {
        items: (page.resources as { public_id: string; created_at: string }[]).map((item) => ({
          publicId: item.public_id,
          kind,
          createdAtMs: Date.parse(item.created_at),
        })),
        next: page.next_cursor ?? null,
      }
    },
    async usage() {
      const usage = await cloudinary.api.usage(credentials)
      return {
        storageBytes: usage.storage?.usage ?? 0,
        bandwidthBytes: usage.bandwidth?.usage ?? 0,
        transformations: usage.transformations?.usage ?? 0,
      }
    },
  }
  return storage
}

// ─── Falso en disco (E2E y desarrollo sin Cloudinary) ───────────────────────────────────────────

/** Todos los ficheros (sin sus `.meta.json`) bajo `dir`, con su ruta relativa a `root`. */
async function filesUnder(root: string, dir: string): Promise<string[]> {
  const out: string[] = []
  let entries: import('node:fs').Dirent[]
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const item of entries) {
    const path = join(dir, item.name)
    if (item.isDirectory()) out.push(...(await filesUnder(root, path)))
    else if (!item.name.endsWith('.meta.json')) out.push(relative(root, path).split(sep).join('/'))
  }
  return out.sort()
}

/** Página del barrido del almacenamiento falso (pequeña, para probar el troceado). */
export const DISK_LIST_PAGE = 50

/**
 * Las entradas sobre el almacenamiento falso de los samples (la misma carpeta, las mismas rutas de prueba y
 * la misma firma HMAC). La subida por trozos la hacen las rutas de `fakeStorageRoutes`.
 */
export function createDiskEntryStorage(
  disk: DiskSampleStorage,
  measure: MeasureFn = (source) => measureAudio(source),
): EntryStorage {
  const readMeta = async (publicId: string): Promise<DiskMeta | null> => {
    const found = await disk.read(publicId)
    return found?.meta ?? null
  }
  return {
    prefix: disk.prefix,
    folderOf: (kind, weekSlug) => folderOf(disk.prefix, kind, weekSlug),
    publicIdFor: (kind, weekSlug, id) => `${folderOf(disk.prefix, kind, weekSlug)}${id}`,
    sign({ kind, publicId, nowMs }) {
      const fields = {
        public_id: publicId,
        timestamp: String(Math.floor(nowMs / 1000)),
        allowed_formats: ENTRY_UPLOAD_FORMATS[kind].join(','),
      }
      return {
        uploadUrl: `${disk.baseUrl}/api/test/storage/upload`,
        publicId,
        fields: {
          ...fields,
          signature: disk.signUpload(fields.public_id, fields.timestamp, fields.allowed_formats),
        },
      }
    },
    async verify(publicId) {
      const meta = await readMeta(publicId)
      if (!meta) return null
      return {
        publicId,
        format: meta.format,
        bytes: meta.bytes,
        etag: meta.etag ?? '',
        createdAtMs: meta.createdAtMs ?? 0,
        durationMs: meta.durationMs ?? null,
        width: meta.width,
        height: meta.height,
      }
    },
    async measure(publicId) {
      const found = await disk.read(publicId)
      if (!found) throw new Error(`No existe ${publicId}`)
      const { bytes } = found
      return measure(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes)
            controller.close()
          },
        }),
      )
    },
    streamUrl: (publicId) => disk.streamUrl(publicId),
    coverUrl: (publicId) => disk.streamUrl(publicId),
    remove: (publicId) => disk.remove(publicId, 'original'),
    async listByPrefix(kind, cursor) {
      const folder = `${disk.prefix}/${FOLDER[kind]}/`
      const all = await filesUnder(disk.root, join(disk.root, folder))
      const start = cursor ? Number(cursor) : 0
      const slice = all.slice(start, start + DISK_LIST_PAGE)
      const items: ListedAsset[] = []
      for (const publicId of slice) {
        const meta = JSON.parse(await readFile(join(disk.root, `${publicId}.meta.json`), 'utf8')) as DiskMeta
        items.push({ publicId, kind, createdAtMs: meta.createdAtMs ?? 0 })
      }
      const next = start + DISK_LIST_PAGE < all.length ? String(start + DISK_LIST_PAGE) : null
      return { items, next }
    },
    async usage() {
      return { storageBytes: 0, bandwidthBytes: 0, transformations: 0 }
    },
  }
}
