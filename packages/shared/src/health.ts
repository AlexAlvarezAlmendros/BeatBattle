import { z } from 'zod'
import { dataEnvelopeSchema } from './envelope'

/**
 * `GET /api/health` (guía §4.10). Solo hay `{ data }` cuando la API puede atender: si la base de
 * datos no responde, la respuesta es un 503 con el sobre de error `SERVICE_UNAVAILABLE`
 * (`details.db = 'down'`), que es lo que miran los monitores externos.
 *
 * Crece por fases: la comprobación de Cloudinary (Fase 4) añadirá su campo y el estado `degraded`
 * para dependencias no imprescindibles.
 */
export const healthSchema = z.object({
  status: z.literal('ok'),
  db: z.literal('up'),
  /** Instante del servidor en ms Unix (UTC): respeta el reloj de prueba (`x-bb-test-now`). */
  time: z.number().int().nonnegative(),
})
export type Health = z.infer<typeof healthSchema>

export const healthResponseSchema = dataEnvelopeSchema(healthSchema)
