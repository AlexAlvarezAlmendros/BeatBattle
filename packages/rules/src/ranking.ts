// Clasificación de una semana (guía §2.8, §4.5, Anexo G): la media bayesiana con la media de la semana,
// los desempates, el ex aequo y el podio con un mínimo de votos. Es lo que congela el sellado.
//
// - **Puntuación**: `(C · m + Σ) / (C + n)`, con `m` la media de todos los votos válidos de la semana
//   (`RF-RES-01`). Se compara con aritmética entera (productos cruzados de `C·S + N·Σᵢ` entre
//   `N·(C + nᵢ)`), así que el orden no depende del redondeo de coma flotante.
// - **Desempates**, en orden: más votos válidos → mayor mediana → más votos de 5. Si todo empata, comparten
//   posición y la siguiente salta (1, 1, 3) (`RF-RES-02`).
// - **Sin clasificar**: con menos de `PODIUM_MIN_VOTES` votos, sin posición, al final y en orden de subida
//   (`RF-RES-03`).
// - Una función pura y total de los votos válidos: el orden en que llegan no cambia nada (`RF-RES-04`).
//
// Recibe solo votos válidos (sin cuentas bloqueadas, anulados ni de entradas retiradas o descalificadas):
// filtrarlos es del sellado (`RF-RES-05`).

import { BAYES_PRIOR_WEIGHT, PODIUM_MIN_VOTES, STARS_MAX, STARS_MIN } from './balance'
import { histogram, median, type StarHistogram } from './scoring'
import { seasonPoints } from './season'

/** Una entrada de la semana para clasificar. */
export interface RankEntry {
  readonly id: string
  /** Instante de subida (ms): el orden de las sin clasificar. */
  readonly submittedAt: number
}

/** Un voto válido. */
export interface RankVote {
  readonly entryId: string
  readonly stars: number
}

/** La fila del snapshot de una entrada (tabla `result`, §4.11). */
export interface RankResult {
  readonly entryId: string
  /** Posición (1 = primera; ex aequo comparten), o `null` sin clasificar. */
  readonly position: number | null
  /** Puntuación bayesiana × 1000, redondeada. */
  readonly scoreMilli: number
  readonly votes: number
  /** Media aritmética × 1000, redondeada (0 sin votos). */
  readonly meanMilli: number
  /** Mediana × 2 (para guardar las medias de dos centrales como entero; 0 sin votos). */
  readonly medianHalf: number
  readonly histogram: StarHistogram
  readonly seasonPoints: number
}

interface Tally {
  entry: RankEntry
  stars: number[]
  sum: number
}

function byId(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Clasifica las entradas de una semana con sus votos válidos. Los votos a entradas que no están en la lista se
 * ignoran (no cuentan para nadie ni para la media de la semana). Devuelve una fila por entrada: primero las
 * clasificadas por posición, después las sin clasificar en orden de subida.
 */
export function rank(
  entries: readonly RankEntry[],
  votes: readonly RankVote[],
  priorWeight: number = BAYES_PRIOR_WEIGHT,
): RankResult[] {
  const tallies = new Map<string, Tally>()
  for (const entry of entries) tallies.set(entry.id, { entry, stars: [], sum: 0 })
  let weekCount = 0
  let weekSum = 0
  for (const vote of votes) {
    const tally = tallies.get(vote.entryId)
    if (!tally) continue
    if (!Number.isInteger(vote.stars) || vote.stars < STARS_MIN || vote.stars > STARS_MAX)
      throw new RangeError(
        `Cada voto debe ser un entero de ${STARS_MIN} a ${STARS_MAX} (recibido: ${vote.stars})`,
      )
    tally.stars.push(vote.stars)
    tally.sum += vote.stars
    weekCount += 1
    weekSum += vote.stars
  }

  // Puntuación como fracción exacta `num / den`: `(C·S + N·Σᵢ) / (N·(C + nᵢ))`; sin votos en la semana, 0.
  const C = priorWeight
  const fraction = (tally: Tally) =>
    weekCount === 0
      ? { num: 0, den: 1 }
      : { num: C * weekSum + weekCount * tally.sum, den: weekCount * (C + tally.stars.length) }
  const fives = (tally: Tally) => tally.stars.filter((stars) => stars === STARS_MAX).length
  const medianOf = (tally: Tally) => median(tally.stars) ?? 0

  /** Compara dos clasificadas: negativo si `a` va antes. 0 si empatan en todo (ex aequo). */
  const compare = (a: Tally, b: Tally): number => {
    const fa = fraction(a)
    const fb = fraction(b)
    const score = fb.num * fa.den - fa.num * fb.den
    if (score !== 0) return score
    return b.stars.length - a.stars.length || medianOf(b) - medianOf(a) || fives(b) - fives(a)
  }

  const all = [...tallies.values()]
  const qualified = all
    .filter((tally) => tally.stars.length >= PODIUM_MIN_VOTES)
    .sort((a, b) => compare(a, b) || byId(a.entry, b.entry))
  const unqualified = all
    .filter((tally) => tally.stars.length < PODIUM_MIN_VOTES)
    .sort((a, b) => a.entry.submittedAt - b.entry.submittedAt || byId(a.entry, b.entry))

  const row = (tally: Tally, position: number | null): RankResult => {
    const { num, den } = fraction(tally)
    const n = tally.stars.length
    return {
      entryId: tally.entry.id,
      position,
      scoreMilli: Math.round((num / den) * 1000),
      votes: n,
      meanMilli: n === 0 ? 0 : Math.round((tally.sum / n) * 1000),
      medianHalf: Math.round(medianOf(tally) * 2),
      histogram: histogram(tally.stars),
      seasonPoints: position === null ? 0 : seasonPoints(position, true),
    }
  }

  const out: RankResult[] = []
  qualified.forEach((tally, index) => {
    const previous = qualified[index - 1]
    const shared = previous !== undefined && compare(previous, tally) === 0
    const position = shared ? (out[index - 1]?.position ?? index + 1) : index + 1
    out.push(row(tally, position))
  })
  for (const tally of unqualified) out.push(row(tally, null))
  return out
}
