import { z } from 'zod'
import { AVATAR_MAX_BYTES, AVATAR_MIMES } from './profile'
import { MusicalKeySchema, PeaksSchema, WeekSlugSchema } from './weeks'

/**
 * Entradas de la batalla (guía §2.5, §4.8, §4.10; Fase 4): la firma de la subida, la ficha, la edición y lo
 * que devuelve la API de una entrada, pública (que respeta el voto ciego, `RF-ENT-10`) y propia.
 *
 * Los límites del audio (formato, bytes y duración, `RF-ENT-03`) no se validan aquí: los aplica
 * `validateEntryAudio` de `@beatbattle/rules`, en el navegador y en el servidor, para devolver su código
 * propio (`DURATION_OUT_OF_RANGE`…) y no un `VALIDATION_FAILED` genérico.
 */

/** Géneros de la ficha: la misma lista que la web del sello (`ReactOtpWeb`, `BEAT_GENRES`), con su grafía. */
export const BEAT_GENRES = [
  'Trap',
  'Jerk',
  'Hoodtrap',
  'Drill',
  'Boom Bap',
  'Crank',
  'Reggaeton',
  'Electronic',
  'Afrobeats',
  'Club',
  'Dancehall',
  'Jersey',
  'Amapiano',
] as const
export type BeatGenre = (typeof BEAT_GENRES)[number]
/** Como mucho tres géneros por entrada (§2.5). */
export const ENTRY_MAX_GENRES = 3

/** DAW de la lista de la ficha (§2.5); «otro» deja escribir el nombre (hasta `ENTRY_DAW_MAX` caracteres). */
export const DAWS = [
  'FL Studio',
  'Ableton Live',
  'Logic Pro',
  'Pro Tools',
  'Cubase',
  'Studio One',
  'Reaper',
  'Bitwig Studio',
  'Reason',
  'GarageBand',
  'MPC',
  'Maschine',
] as const
export const ENTRY_DAW_MAX = 40

export const ENTRY_TITLE_MIN = 2
export const ENTRY_TITLE_MAX = 60
export const ENTRY_DESCRIPTION_MAX = 280

/**
 * Tipos MIME del audio de una entrada que se declaran al firmar (WAV, AIFF, FLAC, MP3, con sus alias
 * habituales). Si el navegador no da tipo (algunos AIFF), el cliente lo deduce de la extensión.
 */
export const ENTRY_AUDIO_MIMES = [
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/vnd.wave',
  'audio/aiff',
  'audio/x-aiff',
  'audio/flac',
  'audio/x-flac',
  'audio/mpeg',
  'audio/mp3',
] as const

/** La portada propia: las mismas imágenes y el mismo tope que el avatar. */
export const ENTRY_COVER_MIMES = AVATAR_MIMES
export const ENTRY_COVER_MAX_BYTES = AVATAR_MAX_BYTES

/** Tamaño de cada trozo de la subida por trozos (§4.7.4; Cloudinary pide ≥ 5 MB salvo el último). */
export const ENTRY_CHUNK_BYTES = 20 * 1024 * 1024

/**
 * `POST /api/uploads/sign` de una entrada (§4.8.2): lo declarado del audio, que el servidor comprueba con
 * `validateEntryAudio` antes de firmar. `replacing`: el id de la entrada cuyo audio se sustituye
 * (`PUT /api/entries/:id/audio`, `RF-ENT-08`).
 */
export const EntrySignRequestSchema = z
  .object({
    kind: z.literal('entry'),
    weekSlug: WeekSlugSchema,
    mime: z.enum(ENTRY_AUDIO_MIMES),
    bytes: z.number().int().positive(),
    durationMs: z.number().int().positive(),
    replacing: z.string().min(1).max(64).optional(),
  })
  .strict()
export type EntrySignRequest = z.infer<typeof EntrySignRequestSchema>

/** `POST /api/uploads/sign` de la portada propia de una entrada (oculta en voto ciego hasta el sellado). */
export const EntryCoverSignRequestSchema = z
  .object({
    kind: z.literal('entryCover'),
    weekSlug: WeekSlugSchema,
    mime: z.enum(ENTRY_COVER_MIMES),
    bytes: z.number().int().positive().max(ENTRY_COVER_MAX_BYTES),
  })
  .strict()
export type EntryCoverSignRequest = z.infer<typeof EntryCoverSignRequestSchema>

/**
 * Respuesta de la firma de una entrada o su portada: la de cualquier subida firmada más el *intent* (que
 * caduca a la hora, como la firma) y el tamaño de trozo.
 */
export const EntrySignedUploadSchema = z.object({
  uploadUrl: z.string(),
  publicId: z.string(),
  fields: z.record(z.string(), z.string()),
  intentId: z.string(),
  expiresAt: z.number().int(),
  chunkBytes: z.number().int().positive(),
})
export type EntrySignedUpload = z.infer<typeof EntrySignedUploadSchema>

const titleSchema = z.string().trim().min(ENTRY_TITLE_MIN).max(ENTRY_TITLE_MAX)
const genresSchema = z
  .array(z.enum(BEAT_GENRES))
  .max(ENTRY_MAX_GENRES)
  .refine((genres) => new Set(genres).size === genres.length, { message: 'Géneros repetidos' })
const dawSchema = z.string().trim().min(1).max(ENTRY_DAW_MAX)
const descriptionSchema = z.string().trim().max(ENTRY_DESCRIPTION_MAX)

/** Los campos de la ficha (§2.5, «la hoja del luchador»). */
const entryFields = {
  title: titleSchema,
  bpm: z.number().min(40).max(250).nullable(),
  musicalKey: MusicalKeySchema.nullable(),
  /** De la lista (`DAWS`) o el que escriba en «otro»; sin DAW, `null`. */
  daw: dawSchema.nullable(),
  genres: genresSchema,
  description: descriptionSchema.nullable(),
}

/**
 * `POST /api/weeks/:slug/entries` (§4.8.2, paso 3): el *intent* del audio ya subido, la ficha y la
 * declaración. `coverIntentId`: la portada propia ya subida, si la hay. Los metadatos de integridad
 * (duración, bytes, formato, sonoridad, onda) no se aceptan: los fija el servidor (`RF-ENT-05`).
 */
export const EntryCreateSchema = z
  .object({
    intentId: z.string().min(1).max(64),
    coverIntentId: z.string().min(1).max(64).optional(),
    ...entryFields,
    /** «He usado el sample de la semana y el resto del material es mío o libre de derechos». */
    declaration: z.literal(true),
  })
  .strict()
export type EntryCreate = z.infer<typeof EntryCreateSchema>

/**
 * `PATCH /api/entries/:id`: solo lo que cambia de la ficha, hasta el cierre de envíos. `coverIntentId`:
 * otra portada propia ya subida; `null` la quita (vuelve la generativa).
 */
export const EntryUpdateSchema = z
  .object({
    title: entryFields.title.optional(),
    bpm: entryFields.bpm.optional(),
    musicalKey: entryFields.musicalKey.optional(),
    daw: entryFields.daw.optional(),
    genres: entryFields.genres.optional(),
    description: entryFields.description.optional(),
    coverIntentId: z.string().min(1).max(64).nullable().optional(),
  })
  .strict()
export type EntryUpdate = z.infer<typeof EntryUpdateSchema>

/** `PUT /api/entries/:id/audio`: el *intent* del audio nuevo, ya subido (`RF-ENT-08`). */
export const EntryAudioReplaceSchema = z.object({ intentId: z.string().min(1).max(64) }).strict()
export type EntryAudioReplace = z.infer<typeof EntryAudioReplaceSchema>

/** Estados de una entrada (§4.11). */
export const ENTRY_STATUSES = ['processing', 'active', 'hidden', 'withdrawn', 'disqualified'] as const
export type EntryStatus = (typeof ENTRY_STATUSES)[number]

/**
 * La portada: la generativa (con su semilla, `packages/covers`) o la propia, que solo sale cuando la
 * semana ya no es ciega o está sellada (`RF-ENT-10`).
 */
export const EntryCoverSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('generative'), seed: z.number().int().min(0) }),
  z.object({ kind: z.literal('own'), url: z.string() }),
])
export type EntryCover = z.infer<typeof EntryCoverSchema>

/** El productor de una entrada: solo cuando la semana deja verlo (sellada o sin voto ciego). */
export const EntryProducerSchema = z.object({
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
})

/**
 * `GET /api/entries/:id` (pública, §4.10). En voto ciego antes del sellado (`RF-ENT-10`, `RNF-SEC-04`):
 * `producer` es `null`, la portada es la generativa y no hay ningún campo de autoría (ni `userId`, ni
 * `username`, ni `avatar`, ni la URL de la portada propia), ni medias, recuentos de votos o posiciones
 * (`RF-PLAY-05`). `streamUrl` es el MP3 firmado de escucha, nunca el `public_id`.
 */
export const PublicEntrySchema = z
  .object({
    id: z.string(),
    weekSlug: WeekSlugSchema,
    alias: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    bpm: z.number().nullable(),
    musicalKey: MusicalKeySchema.nullable(),
    daw: z.string().nullable(),
    genres: z.array(z.string()),
    durationMs: z.number().int(),
    peaks: PeaksSchema.nullable(),
    /** Ajuste de reproducción para igualar a −14 LUFS (solo atenúa, §4.7.3), en dB. */
    gainDb: z.number().nullable(),
    streamUrl: z.string(),
    cover: EntryCoverSchema,
    producer: EntryProducerSchema.nullable(),
  })
  .strict()
export type PublicEntry = z.infer<typeof PublicEntrySchema>

/**
 * La entrada propia (`viewer.entry` de la semana, `/subir` en edición): lo público más su estado, el
 * recibo, la medición y si aún se puede sustituir el audio (sin votos, `RF-ENT-08`). Nunca medias ni
 * posiciones.
 */
export const OwnEntrySchema = PublicEntrySchema.extend({
  status: z.enum(ENTRY_STATUSES),
  receiptCode: z.string(),
  format: z.string(),
  bytes: z.number().int(),
  loudnessLufs: z.number().nullable(),
  truePeakDb: z.number().nullable(),
  /** La portada propia, para su dueño aunque la semana sea ciega. */
  ownCoverUrl: z.string().nullable(),
  canReplaceAudio: z.boolean(),
  submittedAt: z.number().int(),
  updatedAt: z.number().int(),
}).strict()
export type OwnEntry = z.infer<typeof OwnEntrySchema>
