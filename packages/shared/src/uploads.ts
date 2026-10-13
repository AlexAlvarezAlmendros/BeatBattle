import { z } from 'zod'
import { EntryCoverSignRequestSchema, EntrySignRequestSchema } from './entries'
import { AVATAR_MAX_BYTES, AVATAR_MIMES } from './profile'

/**
 * Subidas firmadas (guía §4.8.2): el navegador sube directo a Cloudinary con los parámetros que firma el
 * servidor: el avatar (tarea 2.19), el audio de una entrada y su portada propia (Fase 4). Los samples se
 * firman en `/api/admin/samples/sign`.
 */
export const UploadSignRequestSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('avatar'),
      mime: z.enum(AVATAR_MIMES),
      bytes: z.number().int().positive().max(AVATAR_MAX_BYTES),
    })
    .strict(),
  EntrySignRequestSchema,
  EntryCoverSignRequestSchema,
])
export type UploadSignRequest = z.infer<typeof UploadSignRequestSchema>

export const SignedUploadSchema = z.object({
  uploadUrl: z.string(),
  publicId: z.string(),
  fields: z.record(z.string(), z.string()),
})
export type SignedUpload = z.infer<typeof SignedUploadSchema>
