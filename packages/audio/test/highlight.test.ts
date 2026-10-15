import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { loudestWindowMs } from '../src/highlight'

describe('el momento más enérgico (6.17, §3.8.6)', () => {
  it('encuentra la ventana más fuerte: un beat callado con 4 s fuertes a partir del segundo 30', () => {
    // 60 s en 600 barras (10 por segundo): fuerte de 30 a 34 s.
    const peaks = Array.from({ length: 600 }, (_, i): [number, number] =>
      i >= 300 && i < 340 ? [-0.9, 0.9] : [-0.1, 0.1],
    )
    expect(loudestWindowMs(peaks, 60_000, 4000)).toBe(30_000)
  })

  it('sin onda o más corto que la ventana, desde el principio', () => {
    expect(loudestWindowMs([], 60_000, 4000)).toBe(0)
    expect(loudestWindowMs([[-1, 1]], 3000, 4000)).toBe(0)
  })

  it('la ventana siempre cabe en el beat (o empieza en 0 si el beat es más corto)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(fc.float({ min: -1, max: 0, noNaN: true }), fc.float({ min: 0, max: 1, noNaN: true })),
          {
            minLength: 1,
            maxLength: 400,
          },
        ),
        fc.integer({ min: 5000, max: 300_000 }),
        fc.constantFrom(4000, 6000),
        (peaks, durationMs, windowMs) => {
          const start = loudestWindowMs(peaks, durationMs, windowMs)
          expect(start).toBeGreaterThanOrEqual(0)
          // Si el beat es más corto que la ventana, desde el principio.
          if (durationMs <= windowMs) expect(start).toBe(0)
          else expect(start + windowMs).toBeLessThanOrEqual(durationMs)
        },
      ),
    )
  })
})
