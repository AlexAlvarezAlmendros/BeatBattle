import { rank } from '@beatbattle/rules'
import { and, eq, inArray, isNull, or } from 'drizzle-orm'
import type { BatchStatement } from '../../db/batch'
import type { Db } from '../../db/client'
import { entry, result, user, vote } from '../../db/schema'

/**
 * El snapshot de una semana (guía §2.8, §4.11; tarea 6.4): la clasificación de `rank` sobre sus entradas en
 * juego y sus **votos válidos** (`RF-RES-05`): sin los anulados por moderación, sin los de cuentas bloqueadas
 * y solo a entradas activas (las retiradas, descalificadas, ocultas o aún en `processing` no se clasifican).
 * Devuelve las sentencias que lo guardan como la revisión `revision` (`INSERT … ON CONFLICT DO NOTHING`: dos
 * sellados a la vez no duplican nada).
 */
export async function snapshotStatements(
  db: Db,
  weekId: string,
  revision: number,
): Promise<BatchStatement[]> {
  const entries = await db
    .select({ id: entry.id, submittedAt: entry.submittedAt })
    .from(entry)
    .where(and(eq(entry.weekId, weekId), eq(entry.status, 'active')))
  if (entries.length === 0) return []
  const votes = await db
    .select({ entryId: vote.entryId, stars: vote.stars })
    .from(vote)
    .leftJoin(user, eq(user.id, vote.userId))
    .where(
      and(
        eq(vote.weekId, weekId),
        eq(vote.voided, false),
        inArray(
          vote.entryId,
          entries.map((row) => row.id),
        ),
        // Una cuenta borrada tras una semana sellada deja sus votos (sin fila de usuario); bloqueada, no.
        or(isNull(user.banned), eq(user.banned, false)),
      ),
    )
  return rank(entries, votes).map((row) =>
    db
      .insert(result)
      .values({
        weekId,
        revision,
        entryId: row.entryId,
        position: row.position,
        scoreMilli: row.scoreMilli,
        votes: row.votes,
        meanMilli: row.meanMilli,
        medianHalf: row.medianHalf,
        histogram: JSON.stringify(row.histogram),
        seasonPoints: row.seasonPoints,
      })
      .onConflictDoNothing(),
  )
}

/** El snapshot vigente de una semana, por entrada. */
export async function snapshotOf(db: Db, weekId: string, revision: number) {
  const rows = await db
    .select()
    .from(result)
    .where(and(eq(result.weekId, weekId), eq(result.revision, revision)))
  return new Map(rows.map((row) => [row.entryId, row]))
}
