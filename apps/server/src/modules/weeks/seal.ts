import { and, eq, isNull, lte } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { week } from '../../db/schema'
import { createUuidV7 } from '../../lib/ids'
import { withLease } from '../../lib/lease'
import { sealingStatements } from '../game/sealing'
import { computeSnapshot, snapshotInserts } from '../results/snapshot'

/**
 * Sellado perezoso e idempotente (§2.1, §4.12, `RF-DROP-03`; tarea 3.9). Lo dispara la primera lectura o
 * el `tick` que llegue tras el cierre de votos. Dos capas:
 *
 * - la *lease* `seal:<semana>` evita calcular dos veces el snapshot a la vez;
 * - el `UPDATE … WHERE sealed_at IS NULL` deja un único sellado aunque la *lease* caduque a medias.
 *
 * Desde la Fase 6 el sellado guarda también la clasificación (`rank` sobre los votos válidos, tabla `result`)
 * como la revisión 1, en el mismo `batch` que `sealed_at` (tarea 6.4). Una semana sin entradas se sella con el
 * snapshot vacío: «Semana desierta» (`RF-RES-10`).
 *
 * Desde la Fase 7, la capa de juego del sellado (XP de resultado, oído de oro, racha y logros de resultado; tarea
 * 7.10) va en ese mismo `batch`, calculada **después** de la clasificación y a partir de ella (`RF-GAME-10`) y
 * condicionada a que la semana quede sellada.
 */

/** Lo que puede tardar un sellado antes de que otro lo dé por perdido. */
const SEAL_LEASE_MS = 60_000

const defaultIds = createUuidV7()

/** Sella una semana si ya cerró y no está sellada. Devuelve `true` si la ha sellado esta llamada. */
export async function sealWeek(
  db: Db,
  input: { weekId: string; now: number; holder: string; newId?: () => string },
): Promise<boolean> {
  const newId = input.newId ?? (() => defaultIds(input.now))
  const sealed = await withLease(
    db,
    { name: `seal:${input.weekId}`, holder: input.holder, ttlMs: SEAL_LEASE_MS, now: input.now },
    async () => {
      // Ya sellada (o aún sin cerrar): nada que hacer. Corregirla es un re-sellado explícito (`RF-RES-06`).
      const [current] = await db
        .select({ sealedAt: week.sealedAt, voteEndsAt: week.voteEndsAt })
        .from(week)
        .where(eq(week.id, input.weekId))
      if (!current || current.sealedAt !== null || current.voteEndsAt > input.now) return false
      // La clasificación, el sello y la capa de juego en un `batch`: o todo o nada. Si otro sella a la vez, el
      // `UPDATE` no toca nada, las filas de la revisión 1 ya existen (`ON CONFLICT DO NOTHING`) y la capa de juego,
      // calculada con los mismos votos, ya dice lo que da esa revisión (no escribe nada nuevo).
      const snapshot = await computeSnapshot(db, input.weekId)
      const game = await sealingStatements(db, {
        weekId: input.weekId,
        revision: 1,
        snapshot,
        now: input.now,
        newId,
      })
      const [updated] = await db.batch([
        db
          .update(week)
          .set({ sealedAt: input.now, resultRevision: 1 })
          .where(and(eq(week.id, input.weekId), isNull(week.sealedAt), lte(week.voteEndsAt, input.now)))
          .returning({ id: week.id }),
        ...snapshotInserts(db, input.weekId, 1, snapshot.rows),
        ...game,
      ])
      return updated.length > 0
    },
  )
  return sealed === true
}

/**
 * Sella todas las semanas cerradas sin sellar (`sealWeeks` del `tick` y las lecturas perezosas), en orden de número:
 * la racha y los logros de una semana dependen de las anteriores.
 */
export async function sealDueWeeks(
  db: Db,
  input: { now: number; holder: string; newId?: () => string },
): Promise<string[]> {
  const due = await db
    .select({ id: week.id, slug: week.slug })
    .from(week)
    .where(and(isNull(week.sealedAt), lte(week.voteEndsAt, input.now)))
    .orderBy(week.number)
  const sealed: string[] = []
  for (const row of due) if (await sealWeek(db, { weekId: row.id, ...input })) sealed.push(row.slug)
  return sealed
}
