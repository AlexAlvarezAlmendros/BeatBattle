import { z } from 'zod'
import { PublicEntrySchema } from './entries'
import { WeekSlugSchema } from './weeks'

/**
 * Resultados de una semana sellada (guía §2.8, §2.9, §4.10; Fase 6): el snapshot de su clasificación, el
 * archivo de semanas y lo que la ficha enseña tras el sellado. Nada de esto existe para una semana sin sellar
 * (`RF-PLAY-05`): la ruta da 404 y la ficha no lleva `result`.
 */

/** Histograma de 5 barras: votos de 1, 2, 3, 4 y 5 estrellas. */
export const HistogramSchema = z.tuple([
  z.number().int().min(0),
  z.number().int().min(0),
  z.number().int().min(0),
  z.number().int().min(0),
  z.number().int().min(0),
])

/** Lo que dice el snapshot de una entrada. */
export const EntryResultSchema = z
  .object({
    /** `null` = sin clasificar (menos de 3 votos válidos). */
    position: z.number().int().min(1).nullable(),
    /** Puntuación bayesiana × 1000. */
    scoreMilli: z.number().int(),
    votes: z.number().int().min(0),
    meanMilli: z.number().int(),
    /** Mediana × 2. */
    medianHalf: z.number().int(),
    histogram: HistogramSchema,
    seasonPoints: z.number().int().min(0),
  })
  .strict()
export type EntryResult = z.infer<typeof EntryResultSchema>

export const ResultRowSchema = z.object({ entry: PublicEntrySchema, result: EntryResultSchema }).strict()
export type ResultRow = z.infer<typeof ResultRowSchema>

/** `GET /api/weeks/:slug/results`. */
export const WeekResultsSchema = z
  .object({
    week: z
      .object({
        slug: WeekSlugSchema,
        number: z.number().int(),
        sampleTitle: z.string(),
        sealedAt: z.number().int(),
        /** Revisión vigente: 1 al sellar, una más con cada re-sellado (`RF-RES-06`). */
        revision: z.number().int().min(1),
        /** Cuándo se corrigió por última vez (re-sellado), o `null`. */
        correctedAt: z.number().int().nullable(),
      })
      .strict(),
    /** Todas las entradas: las clasificadas por posición y después las sin clasificar. Vacía: semana desierta. */
    rows: z.array(ResultRowSchema),
    /** La entrada de quien mira (con sesión) y su resultado, si participó. */
    mine: ResultRowSchema.nullable(),
  })
  .strict()
export type WeekResults = z.infer<typeof WeekResultsSchema>

/** Una semana del archivo (`GET /api/weeks?cursor=`, `RF-ARC-01`). */
export const ArchiveWeekSchema = z
  .object({
    slug: WeekSlugSchema,
    number: z.number().int(),
    label: z.string(),
    sampleTitle: z.string(),
    sampleCoverUrl: z.string(),
    sealedAt: z.number().int(),
    entries: z.number().int().min(0),
    /** Hasta tres: el podio (con ex aequo, los que compartan posición entran mientras quepan). */
    podium: z.array(
      z
        .object({
          position: z.number().int().min(1),
          entryId: z.string(),
          alias: z.string(),
          title: z.string(),
          producer: z.string().nullable(),
        })
        .strict(),
    ),
  })
  .strict()
export type ArchiveWeek = z.infer<typeof ArchiveWeekSchema>

export const ArchiveQuerySchema = z.object({ cursor: z.string().max(64).optional() }).strict()
export const ArchiveSchema = z
  .object({ weeks: z.array(ArchiveWeekSchema), next: z.string().nullable() })
  .strict()
export type Archive = z.infer<typeof ArchiveSchema>

/** `POST /api/admin/entries/:id/disqualify` (§2.13): el motivo (mínimo de la Fase 6; el resto, en la F10). */
export const DisqualifyRequestSchema = z
  .object({
    reason: z.enum(['not_sample', 'rights', 'offensive', 'fraud']),
    note: z.string().trim().max(500).optional(),
  })
  .strict()
export type DisqualifyRequest = z.infer<typeof DisqualifyRequestSchema>
