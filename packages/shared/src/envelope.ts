import { z } from 'zod'

/**
 * Sobre uniforme de la API (guía §4.10): `{ data }` si va bien, `{ error }` si no.
 * El catálogo de códigos crece por fases; los códigos son estables y la UI los traduce por i18n.
 */
export const apiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string(),
  details: z.unknown().optional(),
})
export type ApiError = z.infer<typeof apiErrorSchema>

export const errorEnvelopeSchema = z.object({ error: apiErrorSchema })
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>

export function dataEnvelopeSchema<T extends z.ZodType>(data: T) {
  return z.object({ data })
}
export type DataEnvelope<T> = { data: T }
