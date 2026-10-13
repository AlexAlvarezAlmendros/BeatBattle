import { isoWeekLabel, localDateOf } from '@beatbattle/rules'
import type { Archive, DisqualifyRequest, WeekResults } from '@beatbattle/shared'
import { and, desc, eq, inArray, isNotNull, lt } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { auditLog, entry, sample, week } from '../../db/schema'
import { auditStatement } from '../../lib/audit'
import { appError } from '../../lib/errors'
import type { EntriesService } from '../entries/service'
import type { SampleStorage } from '../storage/samples'
import { sealDueWeeks } from '../weeks/seal'
import { snapshotOf, snapshotStatements } from './snapshot'

/** Semanas por página del archivo (`RF-ARC-01`: con 60, la página 2 empieza en la 21.ª). */
export const ARCHIVE_PAGE_SIZE = 20

export interface ResultsDeps {
  db: Db
  entries: EntriesService
  samples: SampleStorage | null
  newId: () => string
}

type WeekRow = typeof week.$inferSelect

/**
 * Resultados (guía §2.8, §2.9, §4.10; tareas 6.3–6.7): la clasificación sellada de una semana, el archivo, y lo
 * que el admin necesita para corregirla (descalificar y re-sellar). Todo sobre el snapshot de `result`: nada se
 * recalcula al leer.
 */
export function createResultsService(deps: ResultsDeps) {
  const { db } = deps
  const holder = () => deps.newId()

  async function sealedWeek(slug: string, now: number): Promise<WeekRow> {
    // Perezoso: la primera lectura tras el cierre sella (`RF-DROP-03`).
    await sealDueWeeks(db, { now, holder: holder() })
    const [row] = await db.select().from(week).where(eq(week.slug, slug))
    if (!row || row.sealedAt === null) throw appError('NOT_FOUND', 'Esa semana aún no tiene resultados.')
    return row
  }

  async function correctedAt(w: WeekRow): Promise<number | null> {
    if (w.resultRevision <= 1) return null
    const [last] = await db
      .select({ at: auditLog.createdAt })
      .from(auditLog)
      .where(and(eq(auditLog.action, 'week.reseal'), eq(auditLog.target, w.slug)))
      .orderBy(desc(auditLog.createdAt))
      .limit(1)
    return last?.at ?? null
  }

  return {
    /**
     * `GET /api/weeks/:slug/results` (`RF-RES-07`, `RF-RES-08`, `RF-RES-10`): el snapshot vigente con la autoría
     * revelada, las clasificadas primero; vacío si la semana fue desierta. 404 sin sellar.
     */
    async results(slug: string, viewerId: string | null, now: number): Promise<WeekResults> {
      const w = await sealedWeek(slug, now)
      const snapshot = await snapshotOf(db, w.id, w.resultRevision)
      const rows = snapshot.size
        ? await db
            .select()
            .from(entry)
            .where(inArray(entry.id, [...snapshot.keys()]))
        : []
      const presented = await deps.entries.presentAll(rows, w)
      const byId = new Map(rows.map((row) => [row.id, row]))
      const list = presented
        .map((item) => {
          const found = snapshot.get(item.id)
          if (!found) return null
          return {
            entry: item,
            result: {
              position: found.position,
              scoreMilli: found.scoreMilli,
              votes: found.votes,
              meanMilli: found.meanMilli,
              medianHalf: found.medianHalf,
              histogram: JSON.parse(found.histogram) as [number, number, number, number, number],
              seasonPoints: found.seasonPoints,
            },
          }
        })
        .filter((row) => row !== null)
        .sort((a, b) => {
          const pa = a.result.position ?? Number.POSITIVE_INFINITY
          const pb = b.result.position ?? Number.POSITIVE_INFINITY
          if (pa !== pb) return pa - pb
          return (byId.get(a.entry.id)?.submittedAt ?? 0) - (byId.get(b.entry.id)?.submittedAt ?? 0)
        })
      const [s] = await db.select({ title: sample.title }).from(sample).where(eq(sample.id, w.sampleId))
      return {
        week: {
          slug: w.slug,
          number: w.number,
          sampleTitle: s?.title ?? '',
          sealedAt: w.sealedAt as number,
          revision: w.resultRevision,
          correctedAt: await correctedAt(w),
        },
        rows: list,
        mine: viewerId ? (list.find((row) => byId.get(row.entry.id)?.userId === viewerId) ?? null) : null,
      }
    },

    /** `GET /api/weeks?cursor=` (`RF-ARC-01`): las selladas, de la más reciente a la más antigua. */
    async archive(cursor: string | undefined, now: number): Promise<Archive> {
      await sealDueWeeks(db, { now, holder: holder() })
      const before = cursor && /^\d+$/.test(cursor) ? Number(cursor) : null
      const rows = await db
        .select({ week, title: sample.title, cover: sample.coverPublicId })
        .from(week)
        .innerJoin(sample, eq(sample.id, week.sampleId))
        .where(and(isNotNull(week.sealedAt), before === null ? undefined : lt(week.startsAt, before)))
        .orderBy(desc(week.startsAt))
        .limit(ARCHIVE_PAGE_SIZE + 1)
      const page = rows.slice(0, ARCHIVE_PAGE_SIZE)
      const weeks = await Promise.all(
        page.map(async ({ week: w, title, cover }) => {
          const snapshot = await snapshotOf(db, w.id, w.resultRevision)
          const podiumIds = [...snapshot.values()]
            .filter((row) => row.position !== null && row.position <= 3)
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
            .slice(0, 3)
          const entryRows = podiumIds.length
            ? await db
                .select()
                .from(entry)
                .where(
                  inArray(
                    entry.id,
                    podiumIds.map((row) => row.entryId),
                  ),
                )
            : []
          const presented = new Map(
            (await deps.entries.presentAll(entryRows, w)).map((item) => [item.id, item]),
          )
          const coverUrl = deps.samples ? deps.samples.coverUrl(cover, 512) : ''
          return {
            slug: w.slug,
            number: w.number,
            label: isoWeekLabel(localDateOf(w.startsAt)),
            sampleTitle: title,
            sampleCoverUrl: coverUrl,
            sealedAt: w.sealedAt as number,
            // Las que entraron en la clasificación (las activas al sellar).
            entries: snapshot.size,
            podium: podiumIds.map((row) => {
              const item = presented.get(row.entryId)
              return {
                position: row.position as number,
                entryId: row.entryId,
                alias: item?.alias ?? '',
                title: item?.title ?? '',
                producer: item?.producer?.displayName ?? null,
              }
            }),
          }
        }),
      )
      const last = page.at(-1)
      return {
        weeks,
        next: rows.length > ARCHIVE_PAGE_SIZE && last ? String(last.week.startsAt) : null,
      }
    },

    /**
     * `POST /api/admin/entries/:id/disqualify` (§2.13, lo mínimo de la Fase 6): la entrada sale de las listas y
     * de las colas y no se puede votar (`RF-MOD-05`); si la semana ya estaba sellada, hace falta re-sellar.
     */
    async disqualify(adminId: string, id: string, input: DisqualifyRequest, now: number): Promise<void> {
      const [row] = await db.select().from(entry).where(eq(entry.id, id))
      if (!row || row.status === 'withdrawn') throw appError('NOT_FOUND', 'No existe esa entrada.')
      if (row.status === 'disqualified') return
      await db.batch([
        db
          .update(entry)
          .set({ status: 'disqualified', statusReason: input.reason, updatedAt: now })
          .where(eq(entry.id, id)),
        auditStatement(db, {
          id: deps.newId(),
          actorId: adminId,
          action: 'entry.disqualify',
          target: id,
          reason: input.reason,
          payload: input.note ? { note: input.note } : null,
          now,
        }),
      ])
    },

    /**
     * `POST /api/admin/weeks/:slug/reseal` (`RF-RES-06`): una revisión nueva del snapshot con los votos válidos
     * de ahora, su auditoría y el aviso público («Clasificación corregida el …»). La anterior se conserva.
     */
    async reseal(adminId: string, slug: string, now: number): Promise<{ revision: number }> {
      const [w] = await db.select().from(week).where(eq(week.slug, slug))
      if (!w || w.sealedAt === null) throw appError('NOT_FOUND', 'Esa semana aún no está sellada.')
      const revision = w.resultRevision + 1
      const rows = await snapshotStatements(db, w.id, revision)
      const [updated] = await db.batch([
        db
          .update(week)
          .set({ resultRevision: revision })
          .where(and(eq(week.id, w.id), eq(week.resultRevision, w.resultRevision)))
          .returning({ id: week.id }),
        ...rows,
        auditStatement(db, {
          id: deps.newId(),
          actorId: adminId,
          action: 'week.reseal',
          target: slug,
          reason: null,
          payload: { revision },
          now,
        }),
      ])
      if (updated.length === 0)
        throw appError('CONFLICT', 'Otro re-sellado se ha adelantado: vuelve a intentarlo.')
      return { revision }
    },
  }
}

export type ResultsService = ReturnType<typeof createResultsService>
