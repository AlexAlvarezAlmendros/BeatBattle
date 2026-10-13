import { z } from 'zod'
import { BEAT_GENRES, PublicEntrySchema } from './entries'
import { MusicalKeySchema, WeekSlugSchema } from './weeks'

/**
 * Escuchar y votar (guía §2.6, §2.7, §4.10; Fase 5): la lista de entradas con sus órdenes y filtros, el recibo
 * de escucha, el voto, la denuncia, las escuchas, la cola del Modo Jurado y la crónica de la arena.
 *
 * Nada de lo que se responde a quien no es el dueño lleva medias, recuentos por entrada ni posiciones antes
 * del sellado (`RF-PLAY-05`); la autoría la quita la ficha pública (`RF-ENT-10`).
 */

/** Órdenes de la lista (§2.6): nunca «mejor valoradas» antes del sellado. */
export const ENTRY_ORDERS = ['fair', 'new', 'random'] as const
export type EntryOrder = (typeof ENTRY_ORDERS)[number]

/** Rango de BPM del filtro, `«min-max»` con enteros (`90-110`). */
const BpmRangeSchema = z
  .string()
  .regex(/^\d{2,3}-\d{2,3}$/)
  .transform((text) => text.split('-').map(Number) as [number, number])
  .refine(([min, max]) => min <= max, 'El mínimo no puede pasar del máximo')

const QueryFlagSchema = z
  .enum(['1', 'true', '0', 'false'])
  .transform((value) => value === '1' || value === 'true')

/** `GET /api/weeks/:slug/entries?order=&genre=&bpm=&key=&unvoted=&seed=`. */
export const EntryListQuerySchema = z
  .object({
    order: z.enum(ENTRY_ORDERS).default('fair'),
    genre: z.enum(BEAT_GENRES).optional(),
    bpm: BpmRangeSchema.optional(),
    key: MusicalKeySchema.optional(),
    /** Solo las que quien mira aún no ha votado (con sesión). */
    unvoted: QueryFlagSchema.optional(),
    /** Semilla de «Aleatorio» (volver a barajar); sin ella, la del día. */
    seed: z.coerce
      .number()
      .int()
      .min(0)
      .max(2 ** 31)
      .optional(),
  })
  .strict()
export type EntryListQuery = z.infer<typeof EntryListQuerySchema>

/** Una entrada de la lista: la ficha pública, si es la de quien mira y su voto (con sesión). */
export const ListedEntrySchema = PublicEntrySchema.extend({
  mine: z.boolean(),
  myVote: z.number().int().min(1).max(5).nullable(),
}).strict()
export type ListedEntry = z.infer<typeof ListedEntrySchema>

export const EntryListSchema = z
  .object({
    weekSlug: WeekSlugSchema,
    order: z.enum(ENTRY_ORDERS),
    /** Entradas activas de la semana sin filtrar: un total de la semana, nunca de una entrada. */
    total: z.number().int().min(0),
    entries: z.array(ListedEntrySchema),
  })
  .strict()
export type EntryList = z.infer<typeof EntryListSchema>

/** `POST /api/entries/:id/listen`: el inicio de la escucha en el servidor (§4.7.3). */
export const ListenStartSchema = z
  .object({ listenId: z.string(), thresholdMs: z.number().int().min(0), startedAt: z.number().int() })
  .strict()
export type ListenStart = z.infer<typeof ListenStartSchema>

export const ListenQualifyRequestSchema = z.object({ listenId: z.string().min(1).max(64) }).strict()
export const ListenQualifySchema = z.object({ qualifiedAt: z.number().int() }).strict()
export type ListenQualify = z.infer<typeof ListenQualifySchema>

/** Estrellas enteras de 1 a 5 (`RF-VOTE-01`): `0`, `6` o `3.5` → 422. */
export const StarsSchema = z.number().int().min(1).max(5)
export const VoteRequestSchema = z.object({ stars: StarsSchema }).strict()
export type VoteRequest = z.infer<typeof VoteRequestSchema>

export const VoteSchema = z
  .object({
    entryId: z.string(),
    stars: StarsSchema,
    createdAt: z.number().int(),
    updatedAt: z.number().int(),
  })
  .strict()
export type Vote = z.infer<typeof VoteSchema>

/** `GET /api/me/votes?week=`: mis votos de la semana. */
export const MyVotesSchema = z.object({ weekSlug: WeekSlugSchema, votes: z.array(VoteSchema) }).strict()
export type MyVotes = z.infer<typeof MyVotesSchema>

/** Motivos de denuncia (§2.7). */
export const REPORT_REASONS = ['not_sample', 'rights', 'offensive', 'spam', 'other'] as const
export type ReportReason = (typeof REPORT_REASONS)[number]
export const REPORT_DETAILS_MAX = 500

export const ReportRequestSchema = z
  .object({
    reason: z.enum(REPORT_REASONS),
    details: z.string().trim().max(REPORT_DETAILS_MAX).optional(),
  })
  .strict()
export type ReportRequest = z.infer<typeof ReportRequestSchema>

/** `POST /api/entries/:id/play`: una escucha de ≥ 10 s seguidos, una por sesión de escucha (`RF-PLAY-07`). */
export const PlayRequestSchema = z.object({ playId: z.string().uuid() }).strict()

/** `GET /api/entries/:id/stats`: solo para el dueño, votos y escuchas, nunca la media (§2.7). */
export const EntryStatsSchema = z
  .object({ votes: z.number().int().min(0), plays: z.number().int().min(0) })
  .strict()
export type EntryStats = z.infer<typeof EntryStatsSchema>

/** `GET /api/jury/queue?week=`: lo que queda por puntuar, en Ronda justa, y la ronda («RONDA 07 / 23»). */
export const JuryQueueQuerySchema = z.object({ week: WeekSlugSchema.optional() }).strict()
export const JuryQueueSchema = z
  .object({
    weekSlug: WeekSlugSchema,
    /** Entradas que quien mira puede puntuar (ajenas y activas) y cuántas ya ha puntuado. */
    round: z.object({ done: z.number().int().min(0), total: z.number().int().min(0) }).strict(),
    queue: z.array(PublicEntrySchema),
  })
  .strict()
export type JuryQueue = z.infer<typeof JuryQueueSchema>

/** Eventos de la crónica de la arena (§3.8.3): en voto ciego, nunca quién ha subido ni cifras de una entrada. */
export const TickerEventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('entry'), id: z.string(), alias: z.string(), at: z.number().int() }).strict(),
  z
    .object({ kind: z.literal('closing'), phase: z.enum(['submit', 'vote']), days: z.number().int().min(0) })
    .strict(),
  z.object({ kind: z.literal('votes'), count: z.number().int().min(0) }).strict(),
])
export type TickerEvent = z.infer<typeof TickerEventSchema>

export const TickerQuerySchema = z.object({ since: z.coerce.number().int().min(0).optional() }).strict()
export const TickerSchema = z
  .object({ weekSlug: WeekSlugSchema, now: z.number().int(), events: z.array(TickerEventSchema) })
  .strict()
export type Ticker = z.infer<typeof TickerSchema>
