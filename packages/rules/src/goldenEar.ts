// Oído de oro (guía §2.10, Anexo G): correlación de Spearman entre las estrellas de un jurado y la
// puntuación de las entradas que votó. Con empates se usan rangos medios y la correlación de
// Pearson sobre los rangos; sin empates coincide con `ρ = 1 − 6 Σ dᵢ² / (n (n² − 1))`.
//
// `goldenEar(jurado, votosDeLaSemana)` (Fase 7) recalcula la semana como si el jurado no hubiera votado (sin sus
// votos en cada puntuación ni en la media `m`), correlaciona sus estrellas con esas puntuaciones exactas y aplica
// `GOLDEN_EAR_MIN_VOTES` y `GOLDEN_EAR_MIN_RHO` (guía §2.10, `RF-GAME-06`). Es XP: no toca la clasificación
// (`RF-GAME-10`).

import { BAYES_PRIOR_WEIGHT, GOLDEN_EAR_MIN_RHO, GOLDEN_EAR_MIN_VOTES, STARS_MAX, STARS_MIN } from './balance'
import { assertFinite, assertFiniteAtLeast } from './internal/guards'

/**
 * Rangos de 1 a n en orden ascendente; los valores empatados reciben la media de sus rangos
 * (p. ej. `[10, 20, 20, 30]` → `[1, 2.5, 2.5, 4]`).
 */
export function averageRanks(values: readonly number[]): number[] {
  values.forEach((value, i) => {
    assertFinite(value, `values[${i}]`)
  })
  const order = values.map((_, i) => i).sort((i, j) => (values[i] as number) - (values[j] as number))
  const valueAt = (position: number): number => values[order[position] as number] as number
  const ranks = new Array<number>(values.length)
  let start = 0
  while (start < order.length) {
    let end = start
    while (end + 1 < order.length && valueAt(end + 1) === valueAt(start)) {
      end++
    }
    // Posiciones start..end (base 0) → rangos start+1..end+1; su media es (start + end) / 2 + 1.
    const rank = (start + end) / 2 + 1
    for (let k = start; k <= end; k++) ranks[order[k] as number] = rank
    start = end + 1
  }
  return ranks
}

/**
 * Correlación de rangos de Spearman entre dos listas emparejadas (`a[i]` con `b[i]`), en `[-1, 1]`.
 * Devuelve `null` si no está definida: menos de dos pares, o una de las listas sin variación
 * (todos los valores iguales). Lanza `RangeError` si las listas no tienen la misma longitud.
 */
export function spearman(a: readonly number[], b: readonly number[]): number | null {
  if (a.length !== b.length) {
    throw new RangeError(`spearman() necesita listas de la misma longitud (${a.length} ≠ ${b.length})`)
  }
  const n = a.length
  const ra = averageRanks(a)
  const rb = averageRanks(b)
  if (n < 2) return null
  // La media de los rangos (con o sin empates) es siempre (n + 1) / 2.
  const centre = (n + 1) / 2
  let cov = 0
  let varA = 0
  let varB = 0
  for (let i = 0; i < n; i++) {
    const da = (ra[i] as number) - centre
    const db = (rb[i] as number) - centre
    cov += da * db
    varA += da * da
    varB += db * db
  }
  if (varA === 0 || varB === 0) return null
  const rho = cov / Math.sqrt(varA * varB)
  return Math.max(-1, Math.min(1, rho))
}

/** Un voto válido de la semana, con quien lo dio (los que cuentan al sellar, guía §2.8). */
export interface JuryVote {
  readonly voterId: string
  readonly entryId: string
  readonly stars: number
}

/** El oído de oro de un jurado en una semana. */
export interface GoldenEarVerdict {
  /** Votos válidos del jurado en la semana. */
  readonly votes: number
  /** ρ de Spearman, o `null` con menos de `GOLDEN_EAR_MIN_VOTES` votos o si no está definida. */
  readonly rho: number | null
  /** Gana el oído de oro: ≥ `GOLDEN_EAR_MIN_VOTES` votos y ρ ≥ `GOLDEN_EAR_MIN_RHO`. */
  readonly won: boolean
}

/** Puntuación bayesiana como fracción exacta `num / den` (`den > 0`). */
interface Fraction {
  readonly num: number
  readonly den: number
}

/** Negativo si `a < b`, 0 si son iguales y positivo si `a > b`. */
function compareFractions(a: Fraction, b: Fraction): number {
  return a.num * b.den - b.num * a.den
}

/**
 * Oído de oro de `voterId` (guía §2.10, Anexo G, `RF-GAME-06`): Spearman entre sus estrellas y la puntuación de cada
 * entrada que votó, con la semana recalculada **sin sus votos** (en cada entrada y en la media `m`). Las puntuaciones
 * se ordenan con productos cruzados enteros, como en `rank`, y entran en `spearman` como su orden (Spearman solo mira
 * rangos), así que dos puntuaciones iguales empatan siempre.
 *
 * `weekVotes` son los votos válidos de la semana, de todos los jurados (también los de `voterId`). Un jurado vota cada
 * entrada una vez como mucho (`RF-VOTE-02`).
 *
 * La comparación `ρ ≥ 0,6` en coma flotante es exacta en la práctica: con rangos medios, `25 ρ² − 9` es un racional de
 * denominador pequeño, así que un ρ distinto de 0,6 se separa de él mucho más que un ULP, y el 0,6 justo sale
 * redondeado al mismo `0.6` del umbral.
 */
export function goldenEar(
  voterId: string,
  weekVotes: readonly JuryVote[],
  priorWeight: number = BAYES_PRIOR_WEIGHT,
): GoldenEarVerdict {
  assertFiniteAtLeast(priorWeight, 0, 'priorWeight')
  // Con `C = 0`, una entrada sin más votos que los suyos no tendría puntuación.
  if (priorWeight === 0) throw new RangeError('goldenEar necesita un peso del previo positivo')
  const own: JuryVote[] = []
  const others = new Map<string, { count: number; sum: number }>()
  let otherCount = 0
  let otherSum = 0
  for (const vote of weekVotes) {
    if (!Number.isInteger(vote.stars) || vote.stars < STARS_MIN || vote.stars > STARS_MAX)
      throw new RangeError(
        `Cada voto debe ser un entero de ${STARS_MIN} a ${STARS_MAX} (recibido: ${vote.stars})`,
      )
    if (vote.voterId === voterId) {
      if (own.some((mine) => mine.entryId === vote.entryId))
        throw new RangeError(`${voterId} tiene dos votos a la entrada ${vote.entryId}`)
      own.push(vote)
      continue
    }
    const tally = others.get(vote.entryId) ?? { count: 0, sum: 0 }
    tally.count += 1
    tally.sum += vote.stars
    others.set(vote.entryId, tally)
    otherCount += 1
    otherSum += vote.stars
  }

  const votes = own.length
  if (votes < GOLDEN_EAR_MIN_VOTES || otherCount === 0) return { votes, rho: null, won: false }

  // Sin sus votos: `(C · m' + Σᵢ) / (C + nᵢ)` con `m' = S' / N'`, como fracción `(C·S' + N'·Σᵢ) / (N'·(C + nᵢ))`.
  const scores: Fraction[] = own.map((vote) => {
    const tally = others.get(vote.entryId) ?? { count: 0, sum: 0 }
    return {
      num: priorWeight * otherSum + otherCount * tally.sum,
      den: otherCount * (priorWeight + tally.count),
    }
  })
  const order = scores
    .map((_, i) => i)
    .sort((i, j) => compareFractions(scores[i] as Fraction, scores[j] as Fraction))
  // El orden de cada puntuación (0, 1, 2…; las iguales lo comparten): da los mismos rangos que la puntuación.
  const levels = new Array<number>(scores.length)
  let level = 0
  order.forEach((index, k) => {
    const previous = order[k - 1]
    if (
      previous !== undefined &&
      compareFractions(scores[previous] as Fraction, scores[index] as Fraction) !== 0
    )
      level += 1
    levels[index] = level
  })

  const rho = spearman(
    own.map((vote) => vote.stars),
    levels,
  )
  return { votes, rho, won: rho !== null && rho >= GOLDEN_EAR_MIN_RHO }
}
