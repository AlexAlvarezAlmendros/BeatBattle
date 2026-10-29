import { z } from 'zod'
import { AchievementIdSchema, ProfileGameSchema } from './game'
import { USERNAME_MAX, USERNAME_MIN } from './username'

export { AVATAR_MAX_BYTES, AVATAR_MIMES, AVATAR_SIZE } from './avatar'

/**
 * Perfil de productor (guía §2.3, §3.8.10, tarea 2.18): lo que enseña `/p/:username` y lo que se edita en
 * Ajustes → Perfil. Desde la tarea 7.13, el público lleva la capa de juego (`game`: nivel, estadísticas, historial,
 * logros y vitrina), que solo cuenta semanas selladas (hueco G1).
 */

/** Colores de acento de la carta: solo la paleta (§3.2). */
export const ACCENTS = ['red', 'white', 'wine'] as const
export type Accent = (typeof ACCENTS)[number]

/** Enlaces del perfil, en el orden en que se enseñan. */
export const PROFILE_LINK_KINDS = ['instagram', 'soundcloud', 'youtube', 'spotify', 'beatstars'] as const
export type ProfileLinkKind = (typeof PROFILE_LINK_KINDS)[number]

/** Dominios que acepta cada enlace (con o sin `www.`/`m.`): un enlace de Instagram lleva a Instagram. */
export const PROFILE_LINK_HOSTS: Record<ProfileLinkKind, readonly string[]> = {
  instagram: ['instagram.com'],
  soundcloud: ['soundcloud.com', 'on.soundcloud.com'],
  youtube: ['youtube.com', 'youtu.be'],
  spotify: ['open.spotify.com'],
  beatstars: ['beatstars.com'],
}

export const BIO_MAX = 160
export const CITY_MAX = 40
export const LINK_MAX = 200

/** Días entre dos cambios de nombre y días que dura la redirección desde el anterior (`RF-PRF-03`). */
export const USERNAME_CHANGE_DAYS = 30

/**
 * Un enlace válido para su tipo: `https://` y uno de sus dominios. Devuelve la URL normalizada o `null`.
 * Sin esquema, se le pone `https://` («instagram.com/kairo» vale).
 */
export function normalizeProfileLink(kind: ProfileLinkKind, value: string): string | null {
  const raw = value.trim()
  if (!raw || raw.length > LINK_MAX) return null
  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, '')
  if (!PROFILE_LINK_HOSTS[kind].includes(host)) return null
  url.hash = ''
  return url.toString()
}

const text = (max: number) =>
  z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().max(max))
    .transform((value) => (value === '' ? null : value))

export const ProfileLinksSchema = z
  .object(
    Object.fromEntries(
      PROFILE_LINK_KINDS.map((kind) => [kind, z.string().max(LINK_MAX).nullable()]),
    ) as Record<ProfileLinkKind, z.ZodNullable<z.ZodString>>,
  )
  .partial()
  .strict()
export type ProfileLinks = Partial<Record<ProfileLinkKind, string>>

/** La vitrina: hasta tres logros distintos, en el orden en que se enseñan (§2.10, §3.8.10). */
export const SHOWCASE_MAX = 3
export const ShowcaseSchema = z
  .array(AchievementIdSchema)
  .max(SHOWCASE_MAX)
  .refine((ids) => new Set(ids).size === ids.length, { message: 'logros repetidos' })

/**
 * `PUT /api/me/profile`: solo lo que cambia. Un texto vacío borra el campo. La vitrina (tarea 7.13) solo admite logros
 * conseguidos (si no, 422).
 */
export const ProfileUpdateSchema = z
  .object({
    bio: text(BIO_MAX).nullable(),
    city: text(CITY_MAX).nullable(),
    links: ProfileLinksSchema,
    accent: z.enum(ACCENTS),
    showcase: ShowcaseSchema,
  })
  .partial()
  .strict()
export type ProfileUpdate = z.input<typeof ProfileUpdateSchema>

/** `PUT /api/me/username`. */
export const UsernameChangeSchema = z
  .object({ username: z.string().trim().min(USERNAME_MIN).max(USERNAME_MAX) })
  .strict()

/** Lo común del perfil público (`GET /api/profiles/:username`) y del propio (`GET /api/me/profile`). */
export const ProfileBaseSchema = z.object({
  username: z.string(),
  displayUsername: z.string(),
  cardNumber: z.number().int(),
  /** Alta de la cuenta (ms UTC): la antigüedad. */
  joinedAt: z.number().int(),
  xp: z.number().int(),
  bio: z.string().nullable(),
  city: z.string().nullable(),
  links: z.partialRecord(z.enum(PROFILE_LINK_KINDS), z.string()),
  accent: z.enum(ACCENTS),
  avatarUrl: z.string().nullable(),
})

/**
 * `GET /api/profiles/:username` (público): `xp` y `game` solo cuentan lo de semanas selladas (y lo que no es de ninguna
 * semana), así que nada dice quién participa en una semana ciega (hueco G1, §1.3).
 */
export const PublicProfileSchema = ProfileBaseSchema.extend({ game: ProfileGameSchema })
export type PublicProfile = z.infer<typeof PublicProfileSchema>

/** `GET /api/me/profile`: lo editable, con el XP de verdad de la cuenta y la vitrina tal como la eligió. */
export const OwnProfileSchema = ProfileBaseSchema.extend({
  /** Cuándo puede volver a cambiar el nombre (ms UTC), o `null` si ya puede. */
  usernameChangeAvailableAt: z.number().int().nullable(),
  /** La vitrina elegida (logros que tiene); el perfil público enseña de ella solo los que ya son públicos. */
  showcase: z.array(AchievementIdSchema).max(SHOWCASE_MAX),
})
export type OwnProfile = z.infer<typeof OwnProfileSchema>

/** `PUT /api/me/avatar`: el `public_id` que devolvió la firma, una vez subida la imagen. */
export const AvatarConfirmSchema = z.object({ publicId: z.string().min(1).max(200) }).strict()
