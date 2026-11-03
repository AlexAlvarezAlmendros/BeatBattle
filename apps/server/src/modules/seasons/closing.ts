import type { SeasonResult } from '@beatbattle/rules'
import { asc, eq, gt, inArray } from 'drizzle-orm'
import type { BatchStatement } from '../../db/batch'
import type { Db } from '../../db/client'
import { jobState, user, week } from '../../db/schema'
import { achievementXp, level20Statements, refreshXpStatement, unlockStatements } from '../game/repo'
import type { WeekSnapshot } from '../results/snapshot'
import {
  championsBySeason,
  championsOf,
  closedAt,
  type SealedSeasonResult,
  sealedSeasonResults,
  seasonChampHolders,
  weeksOfSeason,
} from './repo'

/**
 * El cierre de una temporada (guía §2.9, hueco G7; tarea 7.11, `RF-ARC-05`): una temporada se cierra cuando ha acabado
 * su trimestre y todas sus semanas están selladas. Entonces sus campeones (la primera fila de la clasificación, uno o
 * varios ex aequo) ganan `season_champ` con su XP, y su ceremonia queda pendiente para cada cuenta hasta que la marca
 * vista (`seen_flag` `season_champion`, que no se escribe al cerrar: la falta de la marca es lo pendiente).
 *
 * - **Al sellar.** La semana del último lunes del trimestre cierra siempre después de que acabe el trimestre: su
 *   sellado cierra la temporada, en su mismo `batch` (`seasonChampionChange`, desde `sealingStatements`). También el
 *   sellado tardío de la última semana que faltaba, si llega con el trimestre ya acabado.
 * - **Sin semana el último lunes**, la cierra el primer `tick` tras el fin del trimestre (`closeDueSeasons`).
 * - **Re-sellar** una semana de una temporada cerrada vuelve a calcular sus campeones, como el resto de lo que da el
 *   sellado (hueco G2): quien pasa a serlo gana `season_champ` y quien deja de serlo de toda temporada cerrada lo
 *   pierde con su XP.
 *
 * `season.wrap` (tarea 7.30) se suma a estos mismos `batch`.
 */

/** Lo que cambia en los campeones de la temporada de una semana que se sella o se re-sella. */
export interface ChampionChange {
  seasonId: string
  /** La última semana de la temporada (la de mayor número): la del logro en el libro. */
  lastWeekId: string
  /** `true` si es este sellado el que la cierra (antes no lo estaba). */
  closing: boolean
  /** Los campeones con la clasificación nueva. */
  champions: string[]
  /** Campeones sin `season_champ` todavía. */
  grant: string[]
  /** Dejan de ser campeones de esta temporada y no lo son de ninguna otra cerrada: pierden `season_champ`. */
  withdraw: string[]
}

/**
 * Los campeones de la temporada de la semana que se sella (o re-sella) con su clasificación nueva, si con ella la
 * temporada queda cerrada; `null` si no.
 */
export async function seasonChampionChange(
  db: Db,
  input: { weekId: string; snapshot: WeekSnapshot; now: number },
): Promise<ChampionChange | null> {
  const { weekId, snapshot, now } = input
  const [target] = await db.select({ seasonId: week.seasonId }).from(week).where(eq(week.id, weekId))
  if (!target) return null
  const { seasonId } = target
  const weeks = await weeksOfSeason(db, seasonId)
  if (!closedAt(seasonId, weeks, now, weekId)) return null

  const stored = await sealedSeasonResults(db, seasonId)
  const owners = new Map(snapshot.entries.map((e) => [e.id, e.userId]))
  const fresh: SeasonResult[] = snapshot.rows.flatMap((row) => {
    const userId = owners.get(row.entryId)
    return userId ? [{ userId, weekId, position: row.position, scoreMilli: row.scoreMilli }] : []
  })
  const champions = championsOf([...stored.filter((row) => row.weekId !== weekId), ...fresh])
  // Antes de este sellado: solo si ya estaba cerrada (un re-sellado) tenía campeones que puedan dejar de serlo.
  const closedBefore = closedAt(seasonId, weeks, now)
  const before = closedBefore ? championsOf(stored) : []
  const holders = await seasonChampHolders(db)
  const grant = champions.filter((id) => !holders.has(id))
  const leaving = before.filter((id) => !champions.includes(id) && holders.has(id))
  let withdraw: string[] = []
  if (leaving.length > 0) {
    const others = await championsBySeason(db, now)
    others.delete(seasonId)
    const elsewhere = new Set([...others.values()].flat())
    withdraw = leaving.filter((id) => !elsewhere.has(id))
  }
  return {
    seasonId,
    lastWeekId: (weeks.at(-1) as { id: string }).id,
    closing: !closedBefore,
    champions,
    grant,
    withdraw,
  }
}

/** El `season_champ` de un campeón con su XP, referido a la temporada y a su última semana. */
export function championUnlock(
  db: Db,
  input: { userId: string; seasonId: string; lastWeekId: string; now: number; newId: () => string },
  guard?: Parameters<typeof unlockStatements>[3],
): BatchStatement[] {
  return unlockStatements(
    db,
    {
      userId: input.userId,
      achievementId: 'season_champ',
      ref: input.seasonId,
      weekId: input.lastWeekId,
      now: input.now,
    },
    { id: input.newId(), amount: achievementXp('season_champ') },
    guard,
  )
}

/** Hasta qué temporada ha cerrado ya el `tick` (`job_state`). */
const CLOSE_STATE = 'seasonClose'

async function lastClosedByTick(db: Db): Promise<string | null> {
  const [row] = await db
    .select({ value: jobState.value })
    .from(jobState)
    .where(eq(jobState.name, CLOSE_STATE))
  if (!row) return null
  try {
    const value = JSON.parse(row.value) as { lastClosed?: unknown }
    return typeof value.lastClosed === 'string' ? value.lastClosed : null
  } catch {
    return null
  }
}

/**
 * Las temporadas que el `tick` cierra (hueco G7): en orden, las que ya están cerradas y aún no había mirado; a sus
 * campeones con cuenta que no tienen `season_champ`, el logro y su XP, en un `batch` por temporada que además apunta
 * hasta dónde ha llegado (`job_state` `seasonClose`). Si ya las había cerrado el sellado, no escribe nada más que eso.
 * Se para en la primera que no está cerrada: las siguientes acaban después. Devuelve las que ha cerrado.
 */
export async function closeDueSeasons(
  db: Db,
  input: { now: number; newId: () => string },
): Promise<string[]> {
  const { now, newId } = input
  const from = await lastClosedByTick(db)
  const seasons = (
    await db
      .selectDistinct({ seasonId: week.seasonId })
      .from(week)
      .where(from === null ? undefined : gt(week.seasonId, from))
      .orderBy(asc(week.seasonId))
  ).map((row) => row.seasonId)
  const closed: string[] = []
  for (const seasonId of seasons) {
    const weeks = await weeksOfSeason(db, seasonId)
    if (!closedAt(seasonId, weeks, now)) break
    const rows: SealedSeasonResult[] = await sealedSeasonResults(db, seasonId)
    const champions = championsOf(rows)
    const holders = await seasonChampHolders(db)
    const missing = champions.filter((id) => !holders.has(id))
    const accounts = missing.length
      ? (await db.select({ id: user.id }).from(user).where(inArray(user.id, missing))).map((u) => u.id).sort()
      : []
    const lastWeekId = (weeks.at(-1) as { id: string }).id
    const statements: BatchStatement[] = accounts.flatMap((userId) => [
      ...championUnlock(db, { userId, seasonId, lastWeekId, now, newId }),
      ...level20Statements(db, {
        userId,
        weekId: lastWeekId,
        now,
        xpId: newId(),
        amount: achievementXp('level_20'),
      }),
      refreshXpStatement(db, userId),
    ])
    const value = JSON.stringify({ lastClosed: seasonId })
    await db.batch([
      db
        .insert(jobState)
        .values({ name: CLOSE_STATE, value, updatedAt: now })
        .onConflictDoUpdate({ target: jobState.name, set: { value, updatedAt: now } }),
      ...statements,
    ])
    closed.push(seasonId)
  }
  return closed
}
