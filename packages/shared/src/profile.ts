import { z } from 'zod'
import { USERNAME_MAX, USERNAME_MIN } from './username'

/**
 * Perfil de productor (guía §2.3, §3.8.10, tarea 2.18): lo que enseña `/p/:username` y lo que se edita en
 * Ajustes → Perfil. Las estadísticas, el historial y los logros llegan con sus fases (5, 6 y 7): de
 * momento la API los da vacíos y la página enseña su estado vacío.
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

/** `PUT /api/me/profile`: solo lo que cambia. Un texto vacío borra el campo. */
export const ProfileUpdateSchema = z
  .object({
    bio: text(BIO_MAX).nullable(),
    city: text(CITY_MAX).nullable(),
    links: ProfileLinksSchema,
    accent: z.enum(ACCENTS),
  })
  .partial()
  .strict()
export type ProfileUpdate = z.input<typeof ProfileUpdateSchema>

/** `PUT /api/me/username`. */
export const UsernameChangeSchema = z
  .object({ username: z.string().trim().min(USERNAME_MIN).max(USERNAME_MAX) })
  .strict()

/** `GET /api/profiles/:username` (público) y `GET /api/me/profile` (con lo editable). */
export const PublicProfileSchema = z.object({
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
export type PublicProfile = z.infer<typeof PublicProfileSchema>

export const OwnProfileSchema = PublicProfileSchema.extend({
  /** Cuándo puede volver a cambiar el nombre (ms UTC), o `null` si ya puede. */
  usernameChangeAvailableAt: z.number().int().nullable(),
})
export type OwnProfile = z.infer<typeof OwnProfileSchema>
