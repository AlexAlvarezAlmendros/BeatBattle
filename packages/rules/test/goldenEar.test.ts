import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { GOLDEN_EAR_MIN_RHO } from '../src/balance'
import { averageRanks, goldenEar, type JuryVote, spearman } from '../src/goldenEar'
import { rank } from '../src/ranking'
import { bayes } from '../src/scoring'

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
  it('RF-GAME-06: Spearman sin empates coincide con la fórmula del Anexo G', () => {
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

  it('RF-GAME-06: Spearman con empates usa rangos medios y Pearson sobre los rangos', () => {
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

/** Una semana: las estrellas del jurado `me` a las entradas e1, e2… y los votos de otras cuentas a cada una. */
function week(myStars: readonly number[], othersByEntry: readonly (readonly number[])[]): JuryVote[] {
  const votes: JuryVote[] = []
  myStars.forEach((stars, i) => {
    votes.push({ voterId: 'me', entryId: `e${i + 1}`, stars })
  })
  othersByEntry.forEach((list, i) => {
    list.forEach((stars, k) => {
      votes.push({ voterId: `v${k}`, entryId: `e${i + 1}`, stars })
    })
  })
  return votes
}

/** ρ con la semana recalculada a mano: `bayes` de scoring con la media `m` que se le pase. */
function rhoWithMean(myStars: readonly number[], othersByEntry: readonly (readonly number[])[], m: number) {
  const scores = othersByEntry.map((list) => Math.round(bayes(list, m) * 1e9))
  return spearman(myStars, scores)
}

const meanOf = (lists: readonly (readonly number[])[]) => {
  const all = lists.flat()
  return all.reduce((a, b) => a + b, 0) / all.length
}

// Caso del Anexo G: 8 entradas, cada una con un voto de otra cuenta.
const ANNEX_G_STARS = [4, 1, 4, 4, 5, 2, 3, 1]
const ANNEX_G_OTHERS = [[4], [1], [3], [3], [2], [3], [1], [1]]

describe('goldenEar', () => {
  it('RF-GAME-06: caso del Anexo G: sin sus votos ρ = 22/√1501 ≈ 0,5678 y no gana', () => {
    // m sin sus votos = 18/8 = 2,25 → puntuaciones (11,25 + v) / 6 → rangos [8; 2; 6; 6; 4; 6; 2; 2].
    const verdict = goldenEar('me', week(ANNEX_G_STARS, ANNEX_G_OTHERS))
    expect(verdict.votes).toBe(8)
    expect(verdict.rho).toBeCloseTo(22 / Math.sqrt(1501), 12)
    expect(verdict.won).toBe(false)
    expect(verdict.rho).toBeCloseTo(rhoWithMean(ANNEX_G_STARS, ANNEX_G_OTHERS, 2.25) as number, 12)
  })

  it('RF-GAME-06: caso del Anexo G: contando sus propios votos habría ganado (69/79): por eso se quitan', () => {
    const votes = week(ANNEX_G_STARS, ANNEX_G_OTHERS)
    const entries = ANNEX_G_STARS.map((_, i) => ({ id: `e${i + 1}`, submittedAt: i }))
    const withOwn = rank(entries, votes)
    const scoreOf = new Map(withOwn.map((row) => [row.entryId, row.scoreMilli]))
    const naive = spearman(
      ANNEX_G_STARS,
      entries.map((e) => scoreOf.get(e.id) as number),
    )
    expect(naive).toBeCloseTo(69 / 79, 12)
    expect(naive).toBeGreaterThanOrEqual(GOLDEN_EAR_MIN_RHO)
    expect(goldenEar('me', votes).won).toBe(false)
  })

  it('RF-GAME-06: caso del Anexo G: con 2 estrellas a la 7.ª en vez de 3, ρ = 24/√1482 ≈ 0,6234 y gana', () => {
    const stars = [4, 1, 4, 4, 5, 2, 2, 1]
    const verdict = goldenEar('me', week(stars, ANNEX_G_OTHERS))
    expect(verdict.rho).toBeCloseTo(24 / Math.sqrt(1482), 12)
    expect(verdict.won).toBe(true)
  })

  it('RF-GAME-06: la media m de la semana también se recalcula sin sus votos (guía §2.10)', () => {
    const stars = [2, 1, 5, 3, 3, 1, 3, 1]
    const others = [[2], [3], [4], [3], [4], [3], [4], [5, 1]]
    const verdict = goldenEar('me', week(stars, others))
    // Con m sin sus votos (29/9) gana; con sus votos en m (48/17) y no en las entradas, no ganaría.
    expect(verdict.rho).toBeCloseTo(rhoWithMean(stars, others, 29 / 9) as number, 12)
    expect(verdict.rho).toBeCloseTo(0.6842105263157895, 12)
    expect(verdict.won).toBe(true)
    const mixed = rhoWithMean(stars, others, meanOf([...others, stars])) as number
    expect(meanOf([...others, stars])).toBeCloseTo(48 / 17, 12)
    expect(mixed).toBeLessThan(GOLDEN_EAR_MIN_RHO)
  })

  it('RF-GAME-06: con menos de 8 votos válidos no se calcula', () => {
    const verdict = goldenEar('me', week(ANNEX_G_STARS.slice(0, 7), ANNEX_G_OTHERS.slice(0, 7)))
    expect(verdict).toEqual({ votes: 7, rho: null, won: false })
    expect(goldenEar('nadie', week(ANNEX_G_STARS, ANNEX_G_OTHERS))).toEqual({
      votes: 0,
      rho: null,
      won: false,
    })
  })

  it('RF-GAME-06: sin ρ definida no hay oído de oro', () => {
    // Todas sus estrellas iguales.
    expect(goldenEar('me', week(Array(8).fill(4), ANNEX_G_OTHERS))).toEqual({
      votes: 8,
      rho: null,
      won: false,
    })
    // Nadie más votó: sin sus votos no queda semana.
    expect(goldenEar('me', week(ANNEX_G_STARS, []))).toEqual({ votes: 8, rho: null, won: false })
    // Las puntuaciones sin sus votos empatan todas.
    expect(goldenEar('me', week(ANNEX_G_STARS, Array(8).fill([3]))).rho).toBeNull()
    // Votos de otros a entradas que no votó: cuentan para m, pero no hay con qué correlacionar más.
    const sparse = [...week(ANNEX_G_STARS, []), { voterId: 'v0', entryId: 'otra', stars: 5 }]
    expect(goldenEar('me', sparse).rho).toBeNull()
  })

  it('RF-GAME-06: coincide con recalcular la semana a mano, sin sus votos (propiedad)', () => {
    const weekArb = fc.integer({ min: 8, max: 14 }).chain((n) =>
      fc.tuple(
        fc.array(fc.integer({ min: 1, max: 5 }), { minLength: n, maxLength: n }),
        fc.array(fc.array(fc.integer({ min: 1, max: 5 }), { maxLength: 6 }), {
          minLength: n,
          maxLength: n,
        }),
      ),
    )
    fc.assert(
      fc.property(weekArb, ([stars, others]) => {
        const verdict = goldenEar('me', week(stars, others))
        expect(verdict.votes).toBe(stars.length)
        if (others.flat().length === 0) {
          expect(verdict.rho).toBeNull()
          return
        }
        const expected = rhoWithMean(stars, others, meanOf(others))
        if (expected === null) expect(verdict.rho).toBeNull()
        else expect(verdict.rho).toBeCloseTo(expected, 12)
        expect(verdict.won).toBe(verdict.rho !== null && verdict.rho >= GOLDEN_EAR_MIN_RHO)
      }),
    )
  })

  it('RF-GAME-06: no depende del orden de los votos ni de quiénes son los demás', () => {
    const votes = week(ANNEX_G_STARS, [[4, 2], [1], [3, 5], [3], [2, 2, 1], [3], [1, 4], [1]])
    const base = goldenEar('me', votes)
    fc.assert(
      fc.property(
        fc.shuffledSubarray(votes, { minLength: votes.length, maxLength: votes.length }),
        (shuffled) => {
          expect(goldenEar('me', shuffled)).toEqual(base)
          const renamed = shuffled.map((v) =>
            v.voterId === 'me' ? v : { ...v, voterId: `x-${v.entryId}-${v.stars}` },
          )
          expect(goldenEar('me', renamed).rho).toBeCloseTo(base.rho as number, 12)
        },
      ),
    )
  })

  it('rechaza votos imposibles o repetidos', () => {
    expect(() => goldenEar('me', [{ voterId: 'me', entryId: 'e1', stars: 6 }])).toThrow(RangeError)
    expect(() => goldenEar('me', [{ voterId: 'v', entryId: 'e1', stars: 2.5 }])).toThrow(RangeError)
    expect(() =>
      goldenEar('me', [
        { voterId: 'me', entryId: 'e1', stars: 4 },
        { voterId: 'me', entryId: 'e1', stars: 5 },
      ]),
    ).toThrow(RangeError)
    expect(() => goldenEar('me', week(ANNEX_G_STARS, ANNEX_G_OTHERS), 0)).toThrow(RangeError)
  })
})
