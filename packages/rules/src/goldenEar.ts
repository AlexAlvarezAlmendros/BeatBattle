// Oído de oro (guía §2.10, Anexo G): correlación de Spearman entre las estrellas de un jurado y la
// puntuación de las entradas que votó. Con empates se usan rangos medios y la correlación de
// Pearson sobre los rangos; sin empates coincide con `ρ = 1 − 6 Σ dᵢ² / (n (n² − 1))`.
//
// `goldenEar(votosDelUsuario, resultados)`, que recalcula cada puntuación sin el voto del propio
// jurado y aplica `GOLDEN_EAR_MIN_VOTES` y `GOLDEN_EAR_MIN_RHO`, llega en la Fase 6.

import { assertFinite } from './internal/guards'

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
