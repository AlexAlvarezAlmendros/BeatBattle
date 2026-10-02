import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { BAYES_PRIOR_WEIGHT, PODIUM_MIN_VOTES } from '../src/balance'
import { bayes, bayesFromTotals, histogram, isStars, mean, median, voteTotals } from '../src/scoring'

/** Redondeo a 4 decimales, como el caso del Anexo G. */
const round4 = (x: number) => Math.round(x * 10_000) / 10_000

/** `count` votos de `stars` estrellas. */
const repeat = (stars: number, count: number) => new Array<number>(count).fill(stars)

const vote = fc.integer({ min: 1, max: 5 })
const votes = fc.array(vote, { maxLength: 200 })
const weekMean = fc.double({ min: 1, max: 5, noNaN: true })
const EPSILON = 1e-12

describe('bayes', () => {
  // Anexo G: semana con m = 3,6 y C = 5.
  const m = 3.6
  const entryA = [5] // 1 voto de 5 → Σ 5
  const entryB = [...repeat(5, 12), ...repeat(4, 8)] // 20 votos, media 4,6 → Σ 92
  const entryC = [...repeat(5, 2), ...repeat(4, 6)] // 8 votos, media 4,25 → Σ 34

  it('RF-RES-01: los votos del caso del Anexo G suman lo que dice la tabla', () => {
    expect(voteTotals(entryA)).toEqual({ count: 1, sum: 5 })
    expect(voteTotals(entryB)).toEqual({ count: 20, sum: 92 })
    expect(voteTotals(entryC)).toEqual({ count: 8, sum: 34 })
    expect(mean(entryB)).toBeCloseTo(4.6, 12)
    expect(mean(entryC)).toBe(4.25)
  })

  it('RF-RES-01: caso del Anexo G con resultado exacto a 4 decimales', () => {
    expect(BAYES_PRIOR_WEIGHT).toBe(5)
    expect(round4(bayes(entryA, m))).toBe(3.8333)
    expect(round4(bayes(entryB, m))).toBe(4.4)
    expect(round4(bayes(entryC, m))).toBe(4)
    expect(bayes(entryA, m)).toBeCloseTo(23 / 6, 12)
    expect(bayes(entryB, m)).toBeCloseTo(110 / 25, 12)
    expect(bayes(entryC, m)).toBeCloseTo(52 / 13, 12)
  })

  it('RF-RES-01: orden B, C, A, y A queda sin clasificar para el podio (< 3 votos)', () => {
    const entries = { A: entryA, B: entryB, C: entryC }
    const order = Object.entries(entries)
      .sort(([, x], [, y]) => bayes(y, m) - bayes(x, m))
      .map(([id]) => id)
    expect(order).toEqual(['B', 'C', 'A'])
    expect(entryA.length).toBeLessThan(PODIUM_MIN_VOTES)
    expect(entryB.length).toBeGreaterThanOrEqual(PODIUM_MIN_VOTES)
    expect(entryC.length).toBeGreaterThanOrEqual(PODIUM_MIN_VOTES)
  })

  it('bayesFromTotals da lo mismo que bayes sobre la lista', () => {
    fc.assert(
      fc.property(votes, weekMean, (stars, m) => {
        expect(bayesFromTotals(voteTotals(stars), m)).toBe(bayes(stars, m))
      }),
    )
  })

  it('siempre queda entre m y la media de la entrada', () => {
    fc.assert(
      fc.property(fc.array(vote, { minLength: 1, maxLength: 200 }), weekMean, (stars, m) => {
        const score = bayes(stars, m)
        const entryMean = mean(stars) as number
        expect(score).toBeGreaterThanOrEqual(Math.min(m, entryMean) - EPSILON)
        expect(score).toBeLessThanOrEqual(Math.max(m, entryMean) + EPSILON)
      }),
    )
  })

  it('sin votos, la puntuación es m', () => {
    fc.assert(
      fc.property(weekMean, (m) => {
        expect(bayes([], m)).toBeCloseTo(m, 12)
      }),
    )
  })

  it('RF-RES-04: el orden de los votos no cambia la puntuación', () => {
    fc.assert(
      fc.property(votes, weekMean, fc.integer(), (stars, m, seed) => {
        const rotated = stars.map((_, i) => stars[(i + Math.abs(seed)) % stars.length] as number)
        expect(bayes(rotated, m)).toBe(bayes(stars, m))
        expect(bayes(stars.slice().reverse(), m)).toBe(bayes(stars, m))
      }),
    )
  })

  it('un voto nuevo de v estrellas acerca la puntuación a v sin pasarse', () => {
    fc.assert(
      fc.property(votes, vote, weekMean, (stars, v, m) => {
        const before = bayes(stars, m)
        const after = bayes([...stars, v], m)
        expect(after).toBeGreaterThanOrEqual(Math.min(before, v) - EPSILON)
        expect(after).toBeLessThanOrEqual(Math.max(before, v) + EPSILON)
      }),
    )
  })

  it('con C = 0 es la media de la entrada', () => {
    expect(bayes([5, 4, 3], 2, 0)).toBe(4)
  })

  it('rechaza argumentos imposibles', () => {
    expect(() => bayes([0], 3)).toThrow(RangeError)
    expect(() => bayes([6], 3)).toThrow(RangeError)
    expect(() => bayes([3.5], 3)).toThrow(RangeError)
    expect(() => bayes([3], 0.5)).toThrow(RangeError)
    expect(() => bayes([3], 5.5)).toThrow(RangeError)
    expect(() => bayes([3], Number.NaN)).toThrow(RangeError)
    expect(() => bayes([3], 3, -1)).toThrow(RangeError)
    expect(() => bayes([], 3, 0)).toThrow(RangeError)
    expect(() => bayesFromTotals({ count: 2, sum: 11 }, 3)).toThrow(RangeError)
    expect(() => bayesFromTotals({ count: 2, sum: 1 }, 3)).toThrow(RangeError)
    expect(() => bayesFromTotals({ count: 1.5, sum: 3 }, 3)).toThrow(RangeError)
  })
})

describe('votos, media, mediana e histograma', () => {
  it('RF-VOTE-01: un voto es un entero de 1 a 5 (0, 6 y 3,5 no lo son)', () => {
    for (const ok of [1, 2, 3, 4, 5]) expect(isStars(ok)).toBe(true)
    for (const bad of [0, 6, 3.5, -1, Number.NaN, '3', null, undefined]) expect(isStars(bad)).toBe(false)
  })

  it('media', () => {
    expect(mean([])).toBeNull()
    expect(mean([5])).toBe(5)
    expect(mean([1, 2, 4])).toBeCloseTo(7 / 3, 12)
  })

  it('mediana con número impar y par de votos', () => {
    expect(median([])).toBeNull()
    expect(median([5, 1, 3])).toBe(3)
    expect(median([1, 2, 3, 4])).toBe(2.5)
    expect(median([4, 4, 5, 5])).toBe(4.5)
    expect(median([2])).toBe(2)
  })

  it('la mediana no depende del orden y queda entre el mínimo y el máximo', () => {
    fc.assert(
      fc.property(fc.array(vote, { minLength: 1 }), (stars) => {
        const value = median(stars) as number
        expect(median(stars.slice().reverse())).toBe(value)
        expect(value).toBeGreaterThanOrEqual(Math.min(...stars))
        expect(value).toBeLessThanOrEqual(Math.max(...stars))
      }),
    )
  })

  it('histograma de 5 barras', () => {
    expect(histogram([])).toEqual([0, 0, 0, 0, 0])
    expect(histogram([1, 5, 5, 3])).toEqual([1, 0, 1, 0, 2])
  })

  it('el histograma cuenta todos los votos y reproduce su suma', () => {
    fc.assert(
      fc.property(votes, (stars) => {
        const bins = histogram(stars)
        expect(bins.reduce((a, b) => a + b, 0)).toBe(stars.length)
        expect(bins.reduce((acc, count, i) => acc + count * (i + 1), 0)).toBe(voteTotals(stars).sum)
      }),
    )
  })

  it('rechaza votos imposibles', () => {
    expect(() => mean([0])).toThrow(RangeError)
    expect(() => median([6])).toThrow(RangeError)
    expect(() => histogram([2.5])).toThrow(RangeError)
  })
})
