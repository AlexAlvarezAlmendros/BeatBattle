import { z } from 'zod'

/**
 * Semanas y samples (guía §2.1, §2.4, §2.14; Fase 3): los contratos de la API pública de la semana y del
 * panel de admin. La fase de una semana viaja ya calculada por el servidor (`phaseOf` de
 * `@beatbattle/rules`); el cliente no la deduce con su reloj, que puede ir mal.
 */

/** Versión de las bases (Anexo A) que acepta quien descarga (`rules_acceptance.rules_version`). */
export const RULES_VERSION = 1

/** Tonalidades: tónica con sostenidos y `m` para menor («Dm», «F#»). La UI la dice en palabras. */
export const TONICS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
export const MUSICAL_KEYS = [...TONICS, ...TONICS.map((tonic) => `${tonic}m` as const)] as const
export type MusicalKey = (typeof MUSICAL_KEYS)[number]
export const MusicalKeySchema = z.enum(MUSICAL_KEYS)

/** Tónica (0 = Do … 11 = Si) y modo de una tonalidad, para afinar los efectos (§3.7.1). */
export function parseMusicalKey(key: MusicalKey): { tonic: number; mode: 'major' | 'minor' } {
  const minor = key.endsWith('m')
  const tonic = TONICS.indexOf((minor ? key.slice(0, -1) : key) as (typeof TONICS)[number])
  return { tonic, mode: minor ? 'minor' : 'major' }
}

/** Los 8 trozos del sample para el kit de la semana (§2.4, §3.7.6). */
export const CHOPS_COUNT = 8
export const ChopSchema = z
  .object({ startMs: z.number().int().min(0), endMs: z.number().int().positive() })
  .strict()
  .refine((chop) => chop.endMs > chop.startMs, { message: 'el final va después del inicio' })
export type Chop = z.infer<typeof ChopSchema>

export const WEEK_PHASES = ['scheduled', 'open', 'voting', 'sealing', 'sealed'] as const
export type WeekPhaseName = (typeof WEEK_PHASES)[number]

/** Slug de semana en la URL: `2026-w41`. */
export const WeekSlugSchema = z.string().regex(/^\d{4}-w\d{2}$/)
/** Fecha de calendario en Madrid: `2026-10-05`. */
export const LocalDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const text = (max: number) => z.string().trim().min(1).max(max)
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable()
    .optional()

// ─── Admin: samples ────────────────────────────────────────────────────────────────────────────

export const SAMPLE_UPLOAD_PARTS = ['original', 'stems', 'cover'] as const
export type SampleUploadPart = (typeof SAMPLE_UPLOAD_PARTS)[number]

/** `POST /api/admin/samples/sign`: sin `sampleId`, el servidor abre uno nuevo y lo devuelve. */
export const SampleSignRequestSchema = z
  .object({ sampleId: z.uuid().optional(), part: z.enum(SAMPLE_UPLOAD_PARTS) })
  .strict()
export type SampleSignRequest = z.infer<typeof SampleSignRequestSchema>

const sampleFields = {
  title: text(80),
  credits: text(160),
  origin: optionalText(160),
  /** Licencia de uso: obligatoria (§2.4). */
  licenseText: text(2000),
  bpm: z.number().min(40).max(250).nullable().optional(),
  musicalKey: MusicalKeySchema.nullable().optional(),
  genreHint: optionalText(40),
}

/** `POST /api/admin/samples`: el original y la portada ya están subidos; el servidor los verifica y mide. */
export const SampleCreateSchema = z
  .object({ sampleId: z.uuid(), ...sampleFields, hasStems: z.boolean().default(false) })
  .strict()
export type SampleCreate = z.infer<typeof SampleCreateSchema>

/**
 * `PATCH /api/admin/samples/:id`: solo lo que cambia. `chops`: los 8 o ninguno. `remeasure`: tras volver a
 * subir el original, se mide de nuevo. `hasStems`: tras subir o quitar el zip.
 */
export const SampleUpdateSchema = z
  .object({
    title: sampleFields.title.optional(),
    credits: sampleFields.credits.optional(),
    origin: sampleFields.origin,
    licenseText: sampleFields.licenseText.optional(),
    bpm: sampleFields.bpm,
    musicalKey: sampleFields.musicalKey,
    genreHint: sampleFields.genreHint,
    chops: z.array(ChopSchema).length(CHOPS_COUNT).optional(),
    hasStems: z.boolean().optional(),
    remeasure: z.boolean().optional(),
  })
  .strict()
export type SampleUpdate = z.infer<typeof SampleUpdateSchema>

/** La forma de onda: 1000 tramos `[mín, máx]` en `Int8` codificados en base64 (2000 bytes). */
export const PeaksSchema = z.string()

export const AdminSampleSchema = z.object({
  id: z.string(),
  title: z.string(),
  credits: z.string(),
  origin: z.string().nullable(),
  licenseText: z.string(),
  bpm: z.number().nullable(),
  musicalKey: MusicalKeySchema.nullable(),
  genreHint: z.string().nullable(),
  durationMs: z.number().int(),
  bytes: z.number().int(),
  format: z.string(),
  loudnessLufs: z.number().nullable(),
  peaks: PeaksSchema,
  chops: z.array(ChopSchema),
  hasStems: z.boolean(),
  coverUrl: z.string(),
  streamUrl: z.string(),
  /** Slugs de las semanas que lo usan (con alguna, no se borra). */
  weeks: z.array(z.string()),
  createdAt: z.number().int(),
})
export type AdminSample = z.infer<typeof AdminSampleSchema>

// ─── Admin: calendario ─────────────────────────────────────────────────────────────────────────

/** `POST /api/admin/weeks`: el lunes (en Madrid) y su sample; las fronteras las calcula el servidor. */
export const WeekCreateSchema = z
  .object({
    monday: LocalDateSchema,
    sampleId: z.uuid(),
    challenge: optionalText(140),
    blind: z.boolean().default(true),
    golden: z.boolean().default(false),
  })
  .strict()
export type WeekCreate = z.infer<typeof WeekCreateSchema>

/** `PATCH /api/admin/weeks/:slug`: solo semanas programadas (aún sin abrir); el lunes no se mueve. */
export const WeekUpdateSchema = z
  .object({
    sampleId: z.uuid().optional(),
    challenge: optionalText(140),
    blind: z.boolean().optional(),
    golden: z.boolean().optional(),
  })
  .strict()
export type WeekUpdate = z.infer<typeof WeekUpdateSchema>

export const AdminWeekSchema = z.object({
  id: z.string(),
  number: z.number().int(),
  slug: z.string(),
  /** Semana ISO («2026-W41»). */
  label: z.string(),
  seasonId: z.string(),
  monday: LocalDateSchema,
  sample: z.object({ id: z.string(), title: z.string() }),
  challenge: z.string().nullable(),
  blind: z.boolean(),
  golden: z.boolean(),
  startsAt: z.number().int(),
  submitEndsAt: z.number().int(),
  voteEndsAt: z.number().int(),
  sealedAt: z.number().int().nullable(),
  phase: z.enum(WEEK_PHASES),
  /** Descargas (`RF-DROP-08`): cuentas distintas y total. */
  downloads: z.object({ accounts: z.number().int(), total: z.number().int() }),
})
export type AdminWeek = z.infer<typeof AdminWeekSchema>

/** `GET /api/admin/weeks`: las semanas y los lunes sin semana de las próximas 12 (los huecos en rojo). */
export const AdminCalendarSchema = z.object({
  weeks: z.array(AdminWeekSchema),
  gaps: z.array(LocalDateSchema),
})
export type AdminCalendar = z.infer<typeof AdminCalendarSchema>

// ─── Público ───────────────────────────────────────────────────────────────────────────────────

/**
 * Una semana pública (`GET /api/weeks/current`, `/api/weeks/:slug`): la ficha del drop (§2.4). Del audio,
 * solo el MP3 de escucha firmado; nunca el `public_id` ni el original.
 */
export const PublicWeekSchema = z.object({
  number: z.number().int(),
  slug: z.string(),
  label: z.string(),
  seasonId: z.string(),
  phase: z.enum(WEEK_PHASES),
  startsAt: z.number().int(),
  submitEndsAt: z.number().int(),
  voteEndsAt: z.number().int(),
  challenge: z.string().nullable(),
  golden: z.boolean(),
  sample: z.object({
    title: z.string(),
    credits: z.string(),
    origin: z.string().nullable(),
    licenseText: z.string(),
    bpm: z.number().nullable(),
    musicalKey: MusicalKeySchema.nullable(),
    genreHint: z.string().nullable(),
    durationMs: z.number().int(),
    peaks: PeaksSchema,
    chops: z.array(ChopSchema),
    hasStems: z.boolean(),
    coverUrl: z.string(),
    streamUrl: z.string(),
  }),
  /** Lo de quien mira, si tiene sesión. */
  viewer: z.object({ rulesAccepted: z.boolean(), dropSeen: z.boolean() }).nullable(),
})
export type PublicWeek = z.infer<typeof PublicWeekSchema>

/**
 * `GET /api/weeks/current`: la semana en juego (`open` o `voting`) o, si no hay, la última sellada como
 * `week` con `next` para el próximo drop. Del próximo drop solo se dice **cuándo** (§2.1: en
 * `scheduled` no hay nada público, ni el sample).
 */
export const CurrentWeekSchema = z.object({
  week: PublicWeekSchema.nullable(),
  next: z.object({ startsAt: z.number().int(), number: z.number().int() }).nullable(),
})
export type CurrentWeek = z.infer<typeof CurrentWeekSchema>

/** `POST /api/weeks/:slug/download` (`RF-DROP-06`, `-07`). */
export const DownloadRequestSchema = z
  .object({ kind: z.enum(['original', 'stems']).default('original') })
  .strict()
export const DownloadSchema = z.object({ downloadUrl: z.string(), expiresAt: z.number().int() })
export type Download = z.infer<typeof DownloadSchema>

/** `POST /api/weeks/:slug/rules`: aceptar las bases de la semana. */
export const RulesAcceptSchema = z.object({ rulesVersion: z.literal(RULES_VERSION) }).strict()

/**
 * `POST /api/me/seen`: marcar algo como visto una vez. En la Fase 3, la revelación del drop de una semana
 * (`RF-DROP-11`); la ceremonia y los logros se suman en sus fases.
 */
export const SeenRequestSchema = z.object({ kind: z.literal('drop'), ref: WeekSlugSchema }).strict()
export type SeenRequest = z.infer<typeof SeenRequestSchema>
