import { and, eq, isNull, lte } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { week } from '../../db/schema'
import { withLease } from '../../lib/lease'

/**
 * Sellado perezoso e idempotente (§2.1, §4.12, `RF-DROP-03`; tarea 3.9). Lo dispara la primera lectura o
 * el `tick` que llegue tras el cierre de votos. Dos capas:
 *
 * - la *lease* `seal:<semana>` evita calcular dos veces el snapshot a la vez;
 * - el `UPDATE … WHERE sealed_at IS NULL` deja un único sellado aunque la *lease* caduque a medias.
 *
 * En la Fase 3 el snapshot está vacío (aún no hay entradas): el sellado solo fija `sealed_at` y la
 * revisión 1. La clasificación (`rank`, tabla `result`) llega en la Fase 6 dentro de este mismo paso.
 */

/** Lo que puede tardar un sellado antes de que otro lo dé por perdido. */
const SEAL_LEASE_MS = 60_000

/** Sella una semana si ya cerró y no está sellada. Devuelve `true` si la ha sellado esta llamada. */
export async function sealWeek(
  db: Db,
  input: { weekId: string; now: number; holder: string },
): Promise<boolean> {
  const sealed = await withLease(
    db,
    { name: `seal:${input.weekId}`, holder: input.holder, ttlMs: SEAL_LEASE_MS, now: input.now },
    async () => {
      const updated = await db
        .update(week)
        .set({ sealedAt: input.now, resultRevision: 1 })
        .where(and(eq(week.id, input.weekId), isNull(week.sealedAt), lte(week.voteEndsAt, input.now)))
        .returning({ id: week.id })
      return updated.length > 0
    },
  )
  return sealed === true
}

/** Sella todas las semanas cerradas sin sellar (`sealWeeks` del `tick` y las lecturas perezosas). */
export async function sealDueWeeks(db: Db, input: { now: number; holder: string }): Promise<string[]> {
  const due = await db
    .select({ id: week.id, slug: week.slug })
    .from(week)
    .where(and(isNull(week.sealedAt), lte(week.voteEndsAt, input.now)))
  const sealed: string[] = []
  for (const row of due) if (await sealWeek(db, { weekId: row.id, ...input })) sealed.push(row.slug)
  return sealed
}
