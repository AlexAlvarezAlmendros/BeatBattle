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
})
export type Me = z.infer<typeof MeSchema>
