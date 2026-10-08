import { randomUUID } from 'node:crypto'
import type { DataEnvelope } from '@beatbattle/shared'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { AppError } from '../../lib/errors'
import { validate } from '../../lib/validate'
import type { CloudinaryStorage, ResourceInfo, SignedUpload } from './cloudinary'

/** Comprobaciones del spike (tarea 1.7), hechas desde el servidor contra Cloudinary. */
export interface SpikeChecks {
  /**
   * `RF-STO-02`: el original sin firma no se entrega. Cloudinary responde 404 («Resource not found») a un
   * recurso `authenticated` sin firma: no dice ni que existe.
   */
  unsignedOriginalStatus: number
  /** El derivado firmado: estado, tipo y la cabecera CORS para el origen de la web. */
  stream: { status: number; contentType: string | null; allowOrigin: string | null }
  /** Tasa del derivado (kb/s), de sus bytes y la duración: ~192 con `br_192k`. */
  streamKbps: number | null
}

const Params = z.object({ id: z.uuid() })

/**
 * Rutas del spike de Cloudinary (tarea 1.7), **solo fuera de producción**: crear una subida firmada,
 * consultar el recurso, la URL de escucha, las comprobaciones y borrarlo. Los recursos van bajo
 * `<prefijo>/spike/<uuid>`. Sin credenciales, 503: la página de prueba lo dice.
 */
export function storageSpikeRoutes(
  app: FastifyInstance,
  storage: CloudinaryStorage | null,
  options: { webOrigin: string },
): void {
  const need = () => {
    if (!storage)
      throw new AppError(
        'SERVICE_UNAVAILABLE',
        'Sin credenciales de Cloudinary (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)',
      )
    return storage
  }
  const publicIdOf = (store: CloudinaryStorage, id: string) => `${store.prefix}/spike/${id}`

  app.post('/api/dev/storage/uploads', async (req): Promise<DataEnvelope<SignedUpload & { id: string }>> => {
    const store = need()
    const id = randomUUID()
    return { data: { id, ...store.signUpload({ publicId: publicIdOf(store, id), nowMs: req.now }) } }
  })

  app.get('/api/dev/storage/resources/:id', async (req): Promise<DataEnvelope<ResourceInfo>> => {
    const store = need()
    const { id } = validate(Params, req.params, 'params')
    const resource = await store.verify(publicIdOf(store, id))
    if (!resource) throw new AppError('NOT_FOUND', 'No existe ese recurso')
    return { data: resource }
  })

  app.get('/api/dev/storage/resources/:id/stream', async (req): Promise<DataEnvelope<{ url: string }>> => {
    const store = need()
    const { id } = validate(Params, req.params, 'params')
    return { data: { url: store.streamUrl(publicIdOf(store, id)) } }
  })

  app.get('/api/dev/storage/resources/:id/checks', async (req): Promise<DataEnvelope<SpikeChecks>> => {
    const store = need()
    const { id } = validate(Params, req.params, 'params')
    const publicId = publicIdOf(store, id)
    const unsigned = await fetch(store.unsignedOriginalUrl(publicId), { method: 'HEAD' })
    const stream = await fetch(store.streamUrl(publicId), {
      method: 'HEAD',
      headers: { Origin: options.webOrigin },
    })
    const resource = await store.verify(publicId)
    const streamKbps =
      resource?.stream.bytes && resource.durationSeconds
        ? Math.round((resource.stream.bytes * 8) / resource.durationSeconds / 1000)
        : null
    return {
      data: {
        unsignedOriginalStatus: unsigned.status,
        stream: {
          status: stream.status,
          contentType: stream.headers.get('content-type'),
          allowOrigin: stream.headers.get('access-control-allow-origin'),
        },
        streamKbps,
      },
    }
  })

  app.delete('/api/dev/storage/resources/:id', async (req): Promise<DataEnvelope<{ removed: true }>> => {
    const store = need()
    const { id } = validate(Params, req.params, 'params')
    await store.remove(publicIdOf(store, id))
    return { data: { removed: true } }
  })
}
