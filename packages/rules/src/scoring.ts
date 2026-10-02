// Puntuación de una entrada (guía §2.8, Anexo G): media bayesiana de las estrellas, media, mediana
// e histograma de 5 barras. La clasificación con desempates (`ranking`) llega en la Fase 6 y se
// apoya en estas funciones.
//
// Todas reciben votos válidos (guía §2.8: sin cuentas bloqueadas, anulados ni entradas retiradas)
// como estrellas enteras de 1 a 5, y no dependen del orden de los votos (`RF-RES-04`).

import { BAYES_PRIOR_WEIGHT, STARS_MAX, STARS_MIN } from './balance'
import { assertFinite, assertFiniteAtLeast, assertIntegerInRange } from './internal/guards'

/** Un voto: estrellas enteras de 1 a 5 (`RF-VOTE-01`). */
export type Stars = 1 | 2 | 3 | 4 | 5

/** Votos de 1, 2, 3, 4 y 5 estrellas, en ese orden (índice 0 = 1 estrella). */
export type StarHistogram = readonly [number, number, number, number, number]

/** Recuento y suma de los votos válidos de una entrada (lo que agrega la base de datos). */
export interface VoteTotals {
  readonly count: number
  readonly sum: number
}

/** `true` si `value` es un voto válido: entero de 1 a 5. */
export function isStars(value: unknown): value is Stars {
  return Number.isInteger(value) && (value as number) >= STARS_MIN && (value as number) <= STARS_MAX
}

function assertStars(stars: readonly number[]): void {
  for (const value of stars) {
    if (!isStars(value)) {
      throw new RangeError(`Cada voto debe ser un entero de ${STARS_MIN} a ${STARS_MAX} (recibido: ${value})`)
    }
  }
}

/** Recuento y suma de una lista de votos. */
export function voteTotals(stars: readonly number[]): VoteTotals {
  assertStars(stars)
  let sum = 0
  for (const value of stars) sum += value
  return { count: stars.length, sum }
}

/**
 * Media bayesiana a partir del recuento y la suma de votos:
 * `(C · m + Σ estrellas) / (C + n)` (guía §2.8, `RF-RES-01`).
 *
 * @param weekMean `m`, media de todos los votos válidos de la semana (de 1 a 5).
 * @param priorWeight `C`, peso del previo en votos (Anexo B: 5).
 */
export function bayesFromTotals(
  totals: VoteTotals,
  weekMean: number,
  priorWeight: number = BAYES_PRIOR_WEIGHT,
): number {
  const { count, sum } = totals
  assertIntegerInRange(count, 0, Number.MAX_SAFE_INTEGER, 'count')
  assertIntegerInRange(sum, count * STARS_MIN, count * STARS_MAX, 'sum')
  assertFinite(weekMean, 'weekMean')
  if (weekMean < STARS_MIN || weekMean > STARS_MAX) {
    throw new RangeError(`weekMean debe estar entre ${STARS_MIN} y ${STARS_MAX} (recibido: ${weekMean})`)
  }
  assertFiniteAtLeast(priorWeight, 0, 'priorWeight')
  if (priorWeight + count === 0) {
    throw new RangeError('La media bayesiana no está definida sin votos y con peso del previo 0')
  }
  return (priorWeight * weekMean + sum) / (priorWeight + count)
}

/** Media bayesiana de una lista de votos (ver `bayesFromTotals`). */
export function bayes(
  stars: readonly number[],
  weekMean: number,
  priorWeight: number = BAYES_PRIOR_WEIGHT,
): number {
  return bayesFromTotals(voteTotals(stars), weekMean, priorWeight)
}

/** Media aritmética de los votos, o `null` si no hay ninguno. */
export function mean(stars: readonly number[]): number | null {
  const { count, sum } = voteTotals(stars)
  return count === 0 ? null : sum / count
}

/** Mediana de los votos (media de los dos centrales si hay un número par), o `null` si no hay ninguno. */
export function median(stars: readonly number[]): number | null {
  assertStars(stars)
  if (stars.length === 0) return null
  const sorted = stars.slice().sort((x, y) => x - y)
  const mid = sorted.length >> 1
  const upper = sorted[mid] as number
  return sorted.length % 2 === 1 ? upper : ((sorted[mid - 1] as number) + upper) / 2
}

/** Histograma de 5 barras: cuántos votos de 1, 2, 3, 4 y 5 estrellas hay. */
export function histogram(stars: readonly number[]): StarHistogram {
  assertStars(stars)
  const bins: [number, number, number, number, number] = [0, 0, 0, 0, 0]
  for (const value of stars) bins[value - STARS_MIN] = (bins[value - STARS_MIN] as number) + 1
  return bins
}
