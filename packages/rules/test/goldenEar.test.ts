import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { GOLDEN_EAR_MIN_RHO } from '../src/balance'
import { averageRanks, spearman } from '../src/goldenEar'

/** Fórmula clásica del Anexo G, válida solo sin empates: ρ = 1 − 6 Σ dᵢ² / (n (n² − 1)). */
function classicSpearman(a: readonly number[], b: readonly number[]): number {
  const ra = averageRanks(a)
  const rb = averageRanks(b)
  const n = a.length
  const sumD2 = ra.reduce((acc, r, i) => acc + (r - (rb[i] as number)) ** 2, 0)
  return 1 - (6 * sumD2) / (n * (n * n - 1))
}

const distinctValues = (n: number) =>
  fc.uniqueArray(fc.integer({ min: -1_000, max: 1_000 }), { minLength: n, maxLength: n })

describe('averageRanks', () => {
  it('rangos ascendentes con rangos medios en los empates', () => {
    expect(averageRanks([])).toEqual([])
    expect(averageRanks([30, 10, 20])).toEqual([3, 1, 2])
    expect(averageRanks([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4])
    expect(averageRanks([3, 3, 3])).toEqual([2, 2, 2])
    expect(averageRanks([5, 4, 4, 2, 1])).toEqual([5, 3.5, 3.5, 2, 1])
  })

  it('los rangos suman siempre n (n + 1) / 2', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 1, max: 5 })), (values) => {
        const n = values.length
        expect(averageRanks(values).reduce((a, b) => a + b, 0)).toBe((n * (n + 1)) / 2)
      }),
    )
  })
})

describe('spearman', () => {
  it('RF-GAME-06: sin empates coincide con la fórmula del Anexo G', () => {
    // d = [−1, 1, −1, 1, 0] → Σd² = 4 → ρ = 1 − 24 / 120 = 0,8.
    expect(spearman([1, 2, 3, 4, 5], [2, 1, 4, 3, 5])).toBeCloseTo(0.8, 12)
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 30 }).chain((n) => fc.tuple(distinctValues(n), distinctValues(n))),
        ([a, b]) => {
          expect(spearman(a, b)).toBeCloseTo(classicSpearman(a, b), 12)
        },
      ),
    )
  })

  it('RF-GAME-06: con empates usa rangos medios y Pearson sobre los rangos', () => {
    // Estrellas del jurado y puntuación de cada entrada (recalculada sin su voto, guía §2.10).
    const stars = [5, 4, 4, 2, 1]
    const scores = [4.4, 4.0, 3.8333, 3.5, 3.9]
    // Rangos: [5; 3,5; 3,5; 2; 1] y [5, 4, 2, 1, 3]; desviaciones respecto a 3:
    // [2; 0,5; 0,5; −1; −2] y [2, 1, −1, −2, 0] → cov = 6, Σ = 9,5 y 10 → ρ = 6 / √95 ≈ 0,6156.
    const rho = spearman(stars, scores) as number
    expect(rho).toBeCloseTo(6 / Math.sqrt(95), 12)
    // La fórmula clásica daría 0,625: con empates no vale.
    expect(classicSpearman(stars, scores)).toBeCloseTo(0.625, 12)
    expect(rho).toBeGreaterThanOrEqual(GOLDEN_EAR_MIN_RHO)
  })

  it('1 con el mismo orden y −1 con el orden inverso', () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBe(1)
    expect(spearman([1, 2, 3, 4], [40, 30, 20, 10])).toBe(-1)
  })

  it('null cuando no está definida (menos de 2 pares o una lista constante)', () => {
    expect(spearman([], [])).toBeNull()
    expect(spearman([3], [4.2])).toBeNull()
    expect(spearman([4, 4, 4], [3.1, 3.5, 4.2])).toBeNull()
    expect(spearman([1, 2, 3], [4, 4, 4])).toBeNull()
  })

  it('siempre en [−1, 1], simétrica e invariante a transformaciones crecientes', () => {
    // Estrellas de un jurado y puntuaciones de las entradas, emparejadas.
    const juryAndScores = fc
      .integer({ min: 2, max: 40 })
      .chain((n) =>
        fc.tuple(
          fc.array(fc.integer({ min: 1, max: 5 }), { minLength: n, maxLength: n }),
          fc.array(fc.double({ min: 1, max: 5, noNaN: true }), { minLength: n, maxLength: n }),
        ),
      )
    fc.assert(
      fc.property(juryAndScores, ([stars, scores]) => {
        const rho = spearman(stars, scores)
        if (rho === null) return
        const stretched = stars.map((x) => 3 * x + 7)
        const flipped = stars.map((x) => -x)
        expect(rho).toBeGreaterThanOrEqual(-1)
        expect(rho).toBeLessThanOrEqual(1)
        expect(spearman(scores, stars)).toBeCloseTo(rho, 12)
        expect(spearman(stretched, scores)).toBeCloseTo(rho, 12)
        expect(spearman(flipped, scores)).toBeCloseTo(-rho, 12)
      }),
    )
  })

  it('rechaza listas de distinta longitud o con valores no finitos', () => {
    expect(() => spearman([1, 2], [1])).toThrow(RangeError)
    expect(() => spearman([1, Number.NaN], [1, 2])).toThrow(RangeError)
    expect(() => spearman([1, 2], [1, Number.POSITIVE_INFINITY])).toThrow(RangeError)
  })
})
