import { z } from 'zod'
import { AVATAR_MAX_BYTES, AVATAR_MIMES } from './profile'

/**
 * Subidas firmadas (guía §4.8.2): el navegador sube directo a Cloudinary con los parámetros que firma el
 * servidor. De momento, el avatar (tarea 2.19); las entradas, sus portadas y los samples llegan con sus
 * fases y se añaden aquí como otro `kind`.
 */
export const UploadSignRequestSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('avatar'),
      mime: z.enum(AVATAR_MIMES),
      bytes: z.number().int().positive().max(AVATAR_MAX_BYTES),
    })
    .strict(),
])
export type UploadSignRequest = z.infer<typeof UploadSignRequestSchema>

export const SignedUploadSchema = z.object({
  uploadUrl: z.string(),
  publicId: z.string(),
  fields: z.record(z.string(), z.string()),
})
export type SignedUpload = z.infer<typeof SignedUploadSchema>
