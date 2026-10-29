import { type RankResult, rank } from '@beatbattle/rules'
import { and, eq, inArray, isNull, or } from 'drizzle-orm'
import type { BatchStatement } from '../../db/batch'
import type { Db } from '../../db/client'
import { entry, result, user, vote } from '../../db/schema'

/**
 * El snapshot de una semana (guía §2.8, §4.11; tarea 6.4): la clasificación de `rank` sobre sus entradas en
 * juego y sus **votos válidos** (`RF-RES-05`): sin los anulados por moderación, sin los de cuentas bloqueadas
 * y solo a entradas activas (las retiradas, descalificadas, ocultas o aún en `processing` no se clasifican).
 *
 * Se calcula **antes y sin la capa de juego** (`RF-GAME-10`): este módulo no importa nada de `modules/game`, y `rank`
 * solo recibe de cada voto la entrada y las estrellas. La capa de juego (el oído de oro, tarea 7.10) lee después lo
 * calculado aquí, sin cambiarlo.
 */

/** Un voto válido de la semana con quien lo dio (para el oído de oro; `rank` no ve al votante). */
export interface ValidVote {
  voterId: string
  entryId: string
  stars: number
}

/** La clasificación de una semana y lo que la capa de juego necesita leer de ella. */
export interface WeekSnapshot {
  rows: RankResult[]
  /** Las entradas en juego, con su dueño y la casilla del reto. */
  entries: { id: string; userId: string; challengeClaimed: boolean }[]
  votes: ValidVote[]
}

/** Calcula la clasificación de una semana con sus votos válidos de ahora. */
export async function computeSnapshot(db: Db, weekId: string): Promise<WeekSnapshot> {
  const entries = await db
    .select({
      id: entry.id,
      userId: entry.userId,
      submittedAt: entry.submittedAt,
      challengeClaimed: entry.challengeClaimed,
    })
    .from(entry)
    .where(and(eq(entry.weekId, weekId), eq(entry.status, 'active')))
  if (entries.length === 0) return { rows: [], entries: [], votes: [] }
  const votes = await db
    .select({ voterId: vote.userId, entryId: vote.entryId, stars: vote.stars })
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
  const rows = rank(
    entries.map(({ id, submittedAt }) => ({ id, submittedAt })),
    votes.map(({ entryId, stars }) => ({ entryId, stars })),
  )
  return {
    rows,
    entries: entries.map(({ id, userId, challengeClaimed }) => ({ id, userId, challengeClaimed })),
    votes,
  }
}

/**
 * Las sentencias que guardan una clasificación como la revisión `revision` (`INSERT … ON CONFLICT DO NOTHING`: dos
 * sellados a la vez no duplican nada).
 */
export function snapshotInserts(
  db: Db,
  weekId: string,
  revision: number,
  rows: readonly RankResult[],
): BatchStatement[] {
  return rows.map((row) =>
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

/** Calcula la clasificación de una semana y devuelve las sentencias que la guardan como la revisión `revision`. */
export async function snapshotStatements(
  db: Db,
  weekId: string,
  revision: number,
): Promise<BatchStatement[]> {
  return snapshotInserts(db, weekId, revision, (await computeSnapshot(db, weekId)).rows)
}

/** El snapshot vigente de una semana, por entrada. */
export async function snapshotOf(db: Db, weekId: string, revision: number) {
  const rows = await db
    .select()
    .from(result)
    .where(and(eq(result.weekId, weekId), eq(result.revision, revision)))
  return new Map(rows.map((row) => [row.entryId, row]))
}
