import { v2 as cloudinary } from 'cloudinary'
import type { StorageConfig } from '../../config/env'

/**
 * Almacenamiento de audio en Cloudinary (guía §4.8; spike de la tarea 1.7). La parte de `AudioStorage`
 * (§4.8.6) que necesita el spike: firmar la subida, la URL firmada del derivado de escucha, verificar con
 * la Admin API y borrar. Las credenciales entran por argumento (`StorageConfig`), nunca por la
 * configuración global del SDK.
 *
 * - El audio va como `authenticated` (`RF-STO-02`): solo se entrega con URL firmada de una transformación.
 * - La subida es directa del navegador a Cloudinary, por trozos (`RF-STO-01`): el audio nunca pasa por
 *   la API. El servidor fija el `public_id` (sin id de usuario, `RF-ENT-04`).
 * - El derivado de escucha, `f_mp3,br_192k`, se genera en la subida (`eager`, asíncrono).
 */

/** Derivado de escucha (§4.8.3): MP3 a 192 kb/s. */
export const STREAM_TRANSFORMATION = 'f_mp3,br_192k'

/** Lo que el navegador necesita para subir por trozos a Cloudinary. */
export interface SignedUpload {
  uploadUrl: string
  publicId: string
  /** Campos del formulario de cada trozo (los firmados, la firma y la clave pública). */
  fields: Record<string, string>
}

export interface ResourceInfo {
  publicId: string
  format: string
  bytes: number
  durationSeconds: number | null
  createdAt: string
  /** Estado del derivado de escucha (`eager`): `pending` hasta que Cloudinary lo genera. */
  stream: { status: 'pending' | 'processed' | 'failed'; bytes: number | null }
}

/** Una imagen subida, según la Admin API. */
export interface ImageInfo {
  publicId: string
  format: string
  width: number
  height: number
  bytes: number
  version: number
}

/**
 * Imágenes públicas (`image` / `upload`, §4.8.1): de momento, el avatar (tarea 2.19). Se sube directo del
 * navegador con firma; el servidor fija el `public_id`, los formatos y una transformación de entrada que
 * deja el original en 1024 px como mucho. Se entrega recortada a cuadrado con `c_fill,g_auto` y en el
 * mejor formato que acepte el navegador (`f_auto`: AVIF o WebP).
 */
export interface ImageStorage {
  readonly prefix: string
  signImageUpload(input: { publicId: string; nowMs: number; tags: readonly string[] }): SignedUpload
  verifyImage(publicId: string): Promise<ImageInfo | null>
  /** URL de entrega cuadrada de `size` px (§4.8.3: 64, 256, 512, 1024). */
  imageUrl(publicId: string, input: { size: number; version?: number }): string
  removeImage(publicId: string): Promise<void>
}

/** Formatos de imagen que se aceptan al subir. */
export const IMAGE_FORMATS = 'png,jpg,jpeg,webp'
/** Transformación de entrada: el original nunca pasa de 1024 px de lado. */
export const IMAGE_INCOMING = 'c_limit,w_1024,h_1024'

export interface CloudinaryStorage extends ImageStorage {
  readonly prefix: string
  signUpload(input: { publicId: string; nowMs: number }): SignedUpload
  /** URL firmada del derivado de escucha (la única forma de oír una entrada). */
  streamUrl(publicId: string): string
  /** URL del original **sin firma** (solo para comprobar que da 401, `RF-STO-02`). */
  unsignedOriginalUrl(publicId: string): string
  /** Admin API `resource`: el recurso, o `null` si no existe. */
  verify(publicId: string): Promise<ResourceInfo | null>
  remove(publicId: string): Promise<void>
}

const credentials = (config: StorageConfig) => ({
  cloud_name: config.cloudName,
  api_key: config.apiKey,
  api_secret: config.apiSecret,
})

export function createCloudinaryStorage(config: StorageConfig): CloudinaryStorage {
  return {
    prefix: config.prefix,
    signUpload({ publicId, nowMs }) {
      // Los parámetros firmados (§4.8.2): sin ellos firmados, el navegador podría cambiar dónde y cómo sube.
      const params: Record<string, string> = {
        public_id: publicId,
        timestamp: String(Math.floor(nowMs / 1000)),
        type: 'authenticated',
        eager: STREAM_TRANSFORMATION,
        eager_async: 'true',
        allowed_formats: 'wav,aiff,aif,flac,mp3',
        tags: 'bb,spike',
      }
      const signature = cloudinary.utils.api_sign_request(params, config.apiSecret)
      return {
        uploadUrl: `https://api.cloudinary.com/v1_1/${config.cloudName}/video/upload`,
        publicId,
        fields: { ...params, signature, api_key: config.apiKey },
      }
    },
    streamUrl(publicId) {
      return cloudinary.url(publicId, {
        ...credentials(config),
        resource_type: 'video',
        type: 'authenticated',
        sign_url: true,
        secure: true,
        raw_transformation: STREAM_TRANSFORMATION,
        format: 'mp3',
        // Sin el parámetro de analítica del SDK (`?_a=…`): la URL de escucha es solo la firmada.
        urlAnalytics: false,
      })
    },
    unsignedOriginalUrl(publicId) {
      return `https://res.cloudinary.com/${config.cloudName}/video/authenticated/${publicId}`
    },
    async verify(publicId) {
      try {
        const resource = await cloudinary.api.resource(publicId, {
          ...credentials(config),
          resource_type: 'video',
          type: 'authenticated',
          // Sin esto, la Admin API no devuelve la duración de un audio.
          media_metadata: true,
        })
        const eager = (resource.derived ?? resource.eager ?? []) as {
          bytes?: number
          transformation?: string
        }[]
        const derived = eager.find((item) => item.transformation?.startsWith(STREAM_TRANSFORMATION))
        return {
          publicId: resource.public_id,
          format: resource.format,
          bytes: resource.bytes,
          durationSeconds: typeof resource.duration === 'number' ? resource.duration : null,
          createdAt: resource.created_at,
          stream: derived
            ? { status: 'processed', bytes: derived.bytes ?? null }
            : { status: 'pending', bytes: null },
        }
      } catch (error) {
        if ((error as { error?: { http_code?: number } }).error?.http_code === 404) return null
        throw error
      }
    },
    signImageUpload({ publicId, nowMs, tags }) {
      const params: Record<string, string> = {
        public_id: publicId,
        timestamp: String(Math.floor(nowMs / 1000)),
        allowed_formats: IMAGE_FORMATS,
        transformation: IMAGE_INCOMING,
        overwrite: 'false',
        tags: ['bb', ...tags].join(','),
      }
      const signature = cloudinary.utils.api_sign_request(params, config.apiSecret)
      return {
        uploadUrl: `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,
        publicId,
        fields: { ...params, signature, api_key: config.apiKey },
      }
    },
    async verifyImage(publicId) {
      try {
        const resource = await cloudinary.api.resource(publicId, {
          ...credentials(config),
          resource_type: 'image',
          type: 'upload',
        })
        return {
          publicId: resource.public_id,
          format: resource.format,
          width: resource.width,
          height: resource.height,
          bytes: resource.bytes,
          version: resource.version,
        }
      } catch (error) {
        if ((error as { error?: { http_code?: number } }).error?.http_code === 404) return null
        throw error
      }
    },
    imageUrl(publicId, { size, version }) {
      return cloudinary.url(publicId, {
        cloud_name: config.cloudName,
        resource_type: 'image',
        type: 'upload',
        secure: true,
        version,
        transformation: [
          { crop: 'fill', gravity: 'auto', width: size, height: size },
          { fetch_format: 'auto', quality: 'auto' },
        ],
        urlAnalytics: false,
      })
    },
    async removeImage(publicId) {
      await cloudinary.uploader.destroy(publicId, {
        ...credentials(config),
        resource_type: 'image',
        type: 'upload',
        invalidate: true,
      })
    },
    async remove(publicId) {
      await cloudinary.uploader.destroy(publicId, {
        ...credentials(config),
        resource_type: 'video',
        type: 'authenticated',
        invalidate: true,
      })
    },
  }
}
