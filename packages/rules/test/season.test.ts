import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { seasonPoints } from '../src/season'

describe('seasonPoints', () => {
  it('RF-ARC-03: 25, 18, 15, 12, 10, 8, 6, 4, 2, 1 del 1.º al 10.º (Anexo B)', () => {
    const table = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]
    table.forEach((points, i) => {
      expect(seasonPoints(i + 1, true), `posición ${i + 1}`).toBe(points)
    })
  })

  it('RF-ARC-03: 1 punto por cada entrada clasificada fuera del top 10', () => {
    expect(seasonPoints(11, true)).toBe(1)
    expect(seasonPoints(50, true)).toBe(1)
    expect(seasonPoints(1_000, true)).toBe(1)
  })

  it('RF-ARC-03: una entrada sin clasificar no suma', () => {
    expect(seasonPoints(1, false)).toBe(0)
    expect(seasonPoints(11, false)).toBe(0)
  })

  it('un ex aequo comparte posición y puntos (1, 1, 3)', () => {
    expect([1, 1, 3].map((position) => seasonPoints(position, true))).toEqual([25, 25, 15])
  })

  it('peor posición nunca da más puntos, y siempre al menos 1 si clasifica', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 500 }), fc.integer({ min: 0, max: 500 }), (position, drop) => {
        const points = seasonPoints(position, true)
        expect(points).toBeGreaterThanOrEqual(1)
        expect(seasonPoints(position + drop, true)).toBeLessThanOrEqual(points)
      }),
    )
  })

  it('rechaza posiciones imposibles', () => {
    expect(() => seasonPoints(0, true)).toThrow(RangeError)
    expect(() => seasonPoints(-1, true)).toThrow(RangeError)
    expect(() => seasonPoints(1.5, true)).toThrow(RangeError)
    expect(() => seasonPoints(Number.NaN, false)).toThrow(RangeError)
  })
})
