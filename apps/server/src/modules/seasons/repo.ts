import {
  isSeasonClosed,
  mondayOf,
  type SeasonResult,
  seasonChampions,
  seasonStandings,
} from '@beatbattle/rules'
import { and, asc, desc, eq, isNotNull } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { achievementUnlock, entry, result, week } from '../../db/schema'

/**
 * Temporadas (guía §2.9; tarea 7.11): lo que el servidor lee para la clasificación, el cierre y los campeones. Todo
 * sale de los snapshots vigentes (`result` con `week.result_revision`) de las semanas selladas, nunca de votos vivos
 * (`RF-ARC-03`), así que también la temporada en curso es pública. Los campeones no se guardan: son la primera fila de
 * la clasificación de una temporada cerrada (`RF-ARC-02`, «derivados de los snapshots»).
 */

/** Una semana programada de una temporada. */
export interface SeasonWeekRow {
  id: string
  number: number
  slug: string
  startsAt: number
  sealedAt: number | null
}

/** Las semanas programadas de una temporada, en orden de número. */
export function weeksOfSeason(db: Db, seasonId: string): Promise<SeasonWeekRow[]> {
  return db
    .select({
      id: week.id,
      number: week.number,
      slug: week.slug,
      startsAt: week.startsAt,
      sealedAt: week.sealedAt,
    })
    .from(week)
    .where(eq(week.seasonId, seasonId))
    .orderBy(asc(week.number))
}

/**
 * ¿Está cerrada la temporada en `now` (hueco G7, `isSeasonClosed`)? Con `sealing`, como si esa semana ya estuviera
 * sellada (la que se sella en este `batch`).
 */
export function closedAt(
  seasonId: string,
  weeks: readonly SeasonWeekRow[],
  now: number,
  sealing?: string,
): boolean {
  return isSeasonClosed(
    seasonId,
    weeks.map((w) => ({ monday: mondayOf(w.startsAt), sealed: w.sealedAt !== null || w.id === sealing })),
    now,
  )
}

/** Una fila del snapshot vigente de una semana sellada, con su temporada. */
export interface SealedSeasonResult extends SeasonResult {
  seasonId: string
}

/** Las filas del snapshot vigente de las semanas selladas: de una temporada o, sin ella, de todas. */
export async function sealedSeasonResults(db: Db, seasonId?: string): Promise<SealedSeasonResult[]> {
  return db
    .select({
      seasonId: week.seasonId,
      weekId: result.weekId,
      userId: entry.userId,
      position: result.position,
      scoreMilli: result.scoreMilli,
    })
    .from(result)
    .innerJoin(week, and(eq(week.id, result.weekId), eq(week.resultRevision, result.revision)))
    .innerJoin(entry, eq(entry.id, result.entryId))
    .where(and(isNotNull(week.sealedAt), seasonId === undefined ? undefined : eq(week.seasonId, seasonId)))
}

/** Los campeones (uno o varios ex aequo) con las filas dadas de una temporada; ninguno si nadie clasificó. */
export function championsOf(rows: readonly SeasonResult[]): string[] {
  return seasonChampions(seasonStandings(rows))
}

/**
 * Los campeones de cada temporada cerrada en `now`, por temporada (de la más antigua a la más reciente). Sin las
 * temporadas que no estén en `only`, si se da.
 */
export async function championsBySeason(
  db: Db,
  now: number,
  only?: ReadonlySet<string>,
): Promise<Map<string, string[]>> {
  const weeks = await db
    .select({
      seasonId: week.seasonId,
      id: week.id,
      number: week.number,
      slug: week.slug,
      startsAt: week.startsAt,
      sealedAt: week.sealedAt,
    })
    .from(week)
    .orderBy(asc(week.number))
  const bySeason = new Map<string, SeasonWeekRow[]>()
  for (const { seasonId, ...w } of weeks) {
    if (only && !only.has(seasonId)) continue
    bySeason.set(seasonId, [...(bySeason.get(seasonId) ?? []), w])
  }
  const closed = [...bySeason].filter(([seasonId, list]) => closedAt(seasonId, list, now)).map(([id]) => id)
  if (closed.length === 0) return new Map()
  const rows = (await sealedSeasonResults(db)).filter((row) => closed.includes(row.seasonId))
  const out = new Map<string, string[]>()
  for (const seasonId of closed.sort())
    out.set(seasonId, championsOf(rows.filter((row) => row.seasonId === seasonId)))
  return out
}

/** Quién tiene ya `season_champ` (el logro es uno por cuenta, aunque gane varias temporadas). */
export async function seasonChampHolders(db: Db): Promise<Set<string>> {
  const rows = await db
    .select({ userId: achievementUnlock.userId })
    .from(achievementUnlock)
    .where(eq(achievementUnlock.achievementId, 'season_champ'))
  return new Set(rows.map((row) => row.userId))
}

/**
 * La última temporada cerrada en `now` y sus campeones (para la ceremonia pendiente de `GET /api/me`): recorre las
 * temporadas de la más reciente a la más antigua y se queda con la primera cerrada; `null` si ninguna lo está.
 */
export async function lastClosedSeason(
  db: Db,
  now: number,
): Promise<{ seasonId: string; champions: string[] } | null> {
  const seasons = await db.selectDistinct({ seasonId: week.seasonId }).from(week).orderBy(desc(week.seasonId))
  for (const { seasonId } of seasons) {
    if (!closedAt(seasonId, await weeksOfSeason(db, seasonId), now)) continue
    return { seasonId, champions: championsOf(await sealedSeasonResults(db, seasonId)) }
  }
  return null
}
