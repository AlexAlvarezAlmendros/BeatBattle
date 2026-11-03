// Temporadas (guía §2.9, Anexo B): los puntos de cada entrada en su semana (25, 18, 15, 12, 10, 8, 6, 4, 2, 1 del 1.º
// al 10.º y 1 por cada entrada clasificada fuera del top 10) y la clasificación de la temporada con sus desempates
// (más victorias → más podios → mejor puntuación media), el ex aequo y el campeón. La temporada de una semana
// (`seasonOf`), si es la última (`isLastWeekOfSeason`) y el fin de su trimestre (`seasonEndsAt`) están en `calendar`;
// aquí, si la temporada ya está cerrada (`isSeasonClosed`, hueco G7).
//
// Solo entran semanas selladas: la clasificación sale de los snapshots (`result`), no de votos vivos (`RF-ARC-03`).

import { PODIUM_SIZE, SEASON_POINTS_BY_POSITION, SEASON_POINTS_QUALIFIED_OUTSIDE_TOP } from './balance'
import { formatLocalDate, type LocalDate, seasonEndsAt, seasonOf } from './calendar'
import { assertFinite, assertIntegerInRange } from './internal/guards'

/**
 * Puntos de temporada de una entrada en su semana.
 *
 * @param position Posición en la clasificación semanal (1 = primera). En un ex aequo, todas las
 *   entradas empatadas comparten posición y reciben los mismos puntos (guía §2.8).
 * @param qualified `true` si la entrada clasificó (≥ `PODIUM_MIN_VOTES` votos válidos). Una entrada
 *   sin clasificar no suma puntos.
 */
export function seasonPoints(position: number, qualified: boolean): number {
  assertIntegerInRange(position, 1, Number.MAX_SAFE_INTEGER, 'position')
  if (!qualified) return 0
  return SEASON_POINTS_BY_POSITION[position - 1] ?? SEASON_POINTS_QUALIFIED_OUTSIDE_TOP
}

/** La fila del snapshot de una entrada en una semana sellada de la temporada (lo que guarda `result`). */
export interface SeasonResult {
  /** El productor de la entrada. */
  readonly userId: string
  readonly weekId: string
  /** Posición en su semana, o `null` sin clasificar (no suma ni cuenta). */
  readonly position: number | null
  /** Puntuación bayesiana × 1000 del snapshot (`RankResult.scoreMilli`). */
  readonly scoreMilli: number
}

/** Una fila de la clasificación de la temporada. */
export interface SeasonStanding {
  readonly userId: string
  /** Posición (1 = primera; con todo empatado comparten y la siguiente salta: 1, 1, 3). */
  readonly position: number
  readonly points: number
  /** Semanas en 1.ª posición (ex aequo incluidos). */
  readonly wins: number
  /** Semanas en el top 3 (ex aequo incluidos). */
  readonly podiums: number
  /** Semanas con entrada clasificada. */
  readonly weeks: number
  /** Suma de la puntuación × 1000 de sus entradas clasificadas: la media es `scoreSumMilli / weeks`. */
  readonly scoreSumMilli: number
}

interface Tally {
  userId: string
  points: number
  wins: number
  podiums: number
  weeks: number
  scoreSumMilli: number
}

/** Negativo si `a` va antes: más puntos → más victorias → más podios → mejor media (exacta). 0 si empatan en todo. */
function compareStandings(a: Tally, b: Tally): number {
  return (
    b.points - a.points ||
    b.wins - a.wins ||
    b.podiums - a.podiums ||
    // Medias `sa / wa` y `sb / wb` comparadas con productos cruzados (las dos con `weeks ≥ 1`).
    b.scoreSumMilli * a.weeks - a.scoreSumMilli * b.weeks
  )
}

/**
 * Clasificación de la temporada a partir de los snapshots de sus semanas selladas (guía §2.9, `RF-ARC-03`). Entra
 * quien tiene al menos una entrada clasificada; las filas sin clasificar no suman ni dan entrada en la tabla. Es una
 * función pura del conjunto de filas: el orden en que llegan no cambia nada. Con todo empatado, comparten posición y
 * se listan por `userId` (solo para que el orden sea estable).
 *
 * Cada productor tiene como mucho una fila por semana (una entrada activa por semana, `RF-ENT-01`): dos filas suyas de
 * la misma semana lanzan `RangeError`.
 */
export function seasonStandings(results: readonly SeasonResult[]): SeasonStanding[] {
  const tallies = new Map<string, Tally>()
  const seen = new Set<string>()
  for (const row of results) {
    assertIntegerInRange(row.scoreMilli, 0, Number.MAX_SAFE_INTEGER, 'scoreMilli')
    const key = JSON.stringify([row.userId, row.weekId])
    if (seen.has(key)) throw new RangeError(`${row.userId} tiene dos filas en la semana ${row.weekId}`)
    seen.add(key)
    if (row.position === null) continue
    const points = seasonPoints(row.position, true)
    const tally = tallies.get(row.userId) ?? {
      userId: row.userId,
      points: 0,
      wins: 0,
      podiums: 0,
      weeks: 0,
      scoreSumMilli: 0,
    }
    tally.points += points
    if (row.position === 1) tally.wins += 1
    if (row.position <= PODIUM_SIZE) tally.podiums += 1
    tally.weeks += 1
    tally.scoreSumMilli += row.scoreMilli
    tallies.set(row.userId, tally)
  }

  const sorted = [...tallies.values()].sort(
    (a, b) => compareStandings(a, b) || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0),
  )
  const out: SeasonStanding[] = []
  sorted.forEach((tally, index) => {
    const previous = sorted[index - 1]
    const shared = previous !== undefined && compareStandings(previous, tally) === 0
    const position = shared ? (out[index - 1]?.position ?? index + 1) : index + 1
    out.push({ ...tally, position })
  })
  return out
}

/** Campeones de la temporada: la 1.ª posición, uno o varios ex aequo; ninguno si nadie clasificó (`RF-ARC-05`). */
export function seasonChampions(standings: readonly SeasonStanding[]): string[] {
  return standings.filter((row) => row.position === 1).map((row) => row.userId)
}

/** Una semana programada de la temporada: su lunes y si ya está sellada. */
export interface SeasonWeek {
  readonly monday: LocalDate
  readonly sealed: boolean
}

/**
 * ¿Está cerrada la temporada en `now` (guía §2.9, hueco G7)? Cuando ya no puede tener más semanas y todas las suyas
 * están selladas: ha acabado su trimestre (`seasonEndsAt`) y no le queda ninguna semana sin sellar. La semana de su
 * último lunes cierra siempre después de que acabe el trimestre, así que la cierra su sellado; si ese lunes no tiene
 * semana, la cierra lo primero que llegue tras el fin del trimestre (el `tick`, o el sellado tardío de la última que
 * faltaba). Una temporada sin semanas no se cierra nunca (no tiene campeón).
 *
 * Cada semana tiene que ser de la temporada (`seasonOf` de su lunes); si no, `RangeError`.
 */
export function isSeasonClosed(seasonId: string, weeks: readonly SeasonWeek[], now: number): boolean {
  assertFinite(now, 'now')
  for (const week of weeks)
    if (seasonOf(week.monday) !== seasonId)
      throw new RangeError(`La semana del ${formatLocalDate(week.monday)} no es de la temporada ${seasonId}`)
  return weeks.length > 0 && weeks.every((week) => week.sealed) && now >= seasonEndsAt(seasonId)
}
