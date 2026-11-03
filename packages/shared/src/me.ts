import { z } from 'zod'
import { AchievementIdSchema, MeGameSchema, SeasonIdSchema } from './game'
import { WeekSlugSchema } from './weeks'

/**
 * `GET /api/me` (tarea 2.15): la cuenta de la sesión con lo que pinta el HUD y la carta; desde la 7.13, con su capa de
 * juego en vivo (`game`). `xp` es la de `game.xp` (la de siempre del HUD).
 */
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
  game: MeGameSchema,
})
export type Me = z.infer<typeof MeSchema>

/**
 * `POST /api/me/seen`: marcar algo como visto una vez. La revelación del drop de una semana (`RF-DROP-11`, Fase 3), la
 * ceremonia de resultados de una semana sellada (`RF-RES-09`, Fase 6) y, desde la 7.13, el nivel que ya celebró
 * (`RF-GAME-09`), el aviso de un logro (§3.8.8) y la ceremonia del campeón de una temporada cerrada (`RF-ARC-05`).
 */
export const SeenRequestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('drop'), ref: WeekSlugSchema }).strict(),
  z.object({ kind: z.literal('ceremony'), ref: WeekSlugSchema }).strict(),
  z.object({ kind: z.literal('level'), ref: z.number().int().min(1).max(20) }).strict(),
  z.object({ kind: z.literal('achievement'), ref: AchievementIdSchema }).strict(),
  z.object({ kind: z.literal('season_champion'), ref: SeasonIdSchema }).strict(),
])
export type SeenRequest = z.infer<typeof SeenRequestSchema>

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

/**
 * `DELETE /api/me` (tarea 2.21, `RF-PRF-04`): confirmación escrita, el nombre de productor tal cual (sin
 * distinguir mayúsculas).
 */
export const AccountDeleteSchema = z.object({ confirm: z.string().trim().min(1).max(40) }).strict()
