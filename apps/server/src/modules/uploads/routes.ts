import { type DataEnvelope, type SignedUpload, UploadSignRequestSchema } from '@beatbattle/shared'
import type { FastifyInstance } from 'fastify'
import { requireVerified } from '../../auth/guards'
import { appError } from '../../lib/errors'
import type { RateLimiter } from '../../lib/rateLimit'
import { avatarFolder } from '../profile/service'
import type { ImageStorage } from '../storage/cloudinary'

/** Firmas de subida: 10 por hora y cuenta (§4.13, `RNF-SEC-02`). */
export const UPLOAD_SIGNS_PER_HOUR = 10
const HOUR_MS = 60 * 60 * 1000

export interface UploadsDeps {
  images: ImageStorage | null
  rateLimiter: RateLimiter
  newId: () => string
}

/**
 * `POST /api/uploads/sign` (guía §4.8.2): los parámetros firmados para subir directo a Cloudinary. El
 * servidor fija el `public_id`; el navegador no elige ni la carpeta ni el nombre. De momento, el avatar.
 */
export function uploadsRoutes(app: FastifyInstance, deps: UploadsDeps): void {
  app.post(
    '/api/uploads/sign',
    { preHandler: requireVerified },
    async (req): Promise<DataEnvelope<SignedUpload>> => {
      const request = UploadSignRequestSchema.parse(req.body)
      const userId = req.user?.id as string
      if (!deps.images) throw appError('SERVICE_UNAVAILABLE', 'Las subidas no están disponibles.')
      await deps.rateLimiter.enforce({
        key: `upload-sign:user:${userId}`,
        limit: UPLOAD_SIGNS_PER_HOUR,
        windowMs: HOUR_MS,
        now: req.now,
      })
      const publicId = `${avatarFolder(deps.images.prefix, userId)}${deps.newId()}`
      return { data: deps.images.signImageUpload({ publicId, nowMs: req.now, tags: [request.kind] }) }
    },
  )
}
