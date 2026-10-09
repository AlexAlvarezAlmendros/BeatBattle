import { z } from 'zod'

/** `GET /api/me` (tarea 2.15): la cuenta de la sesión con lo que pinta el HUD y la carta. */
export const MeSchema = z.object({
  id: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  username: z.string(),
  displayUsername: z.string(),
  role: z.enum(['user', 'admin']),
  cardNumber: z.number().int(),
  xp: z.number().int(),
  /** Foto del avatar a 64 px para el HUD (§3.4.1); sin foto, `null` y el monograma. */
  avatarUrl: z.string().nullable(),
})
export type Me = z.infer<typeof MeSchema>

/**
 * Una sesión abierta en Ajustes → Sesiones (§2.3, `RF-AUTH-10`, tarea 2.20): el navegador resumido
 * («Chrome en Linux», nunca la cadena entera), su última actividad y si es la de esta petición. Ni el token
 * ni la IP salen del servidor.
 */
export const ActiveSessionSchema = z.object({
  id: z.string(),
  device: z.string().nullable(),
  createdAt: z.number().int(),
  lastActiveAt: z.number().int(),
  current: z.boolean(),
})
export type ActiveSession = z.infer<typeof ActiveSessionSchema>
export const ActiveSessionListSchema = z.array(ActiveSessionSchema)
