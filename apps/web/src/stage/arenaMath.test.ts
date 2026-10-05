import { textureMobile } from '@beatbattle/shared/tokens'
import { describe, expect, it } from 'vitest'
import { HALFTONE_SHAPES, halftoneDots } from '../ui/arena/halftone'
import { defaultGrid, halftoneReach, SHAPE_INDEX, wedgeSide } from './arenaMath'

/** PRNG con semilla para recorrer puntos al azar de forma reproducible. */
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SIZES = [
  { x: 1440, y: 900 },
  { x: 1366, y: 657 },
  { x: 390, y: 844 },
  { x: 1920, y: 1080 },
]

describe('trama del Escenario igual que la estática (§3.5 capa 0, 1.1)', () => {
  for (const name of Object.keys(SHAPE_INDEX) as (keyof typeof SHAPE_INDEX)[]) {
    for (const size of SIZES) {
      const cell = size.x <= 720 ? textureMobile.halftoneCell : undefined
      const grid = defaultGrid(HALFTONE_SHAPES[name], cell)

      it(`RD-VIS-02 e: ${name} a ${size.x} × ${size.y}: el centro de cada punto estático cae dentro de un punto del shader con su mismo radio`, () => {
        const dots = halftoneDots(size.x, size.y, { ink: 'x', shape: HALFTONE_SHAPES[name], cell })
        expect(dots.length).toBeGreaterThan(0)
        for (const dot of dots) {
          // En su centro, el punto propio da `r − 0`; un vecino solapado puede dar algo más, nunca menos.
          expect(halftoneReach(dot, size, grid)).toBeGreaterThanOrEqual(dot.r - 1e-6)
        }
      })

      it(`RD-VIS-02 e: ${name} a ${size.x} × ${size.y}: un píxel cualquiera está dentro de un punto en el shader si y solo si lo está en la estática`, () => {
        const dots = halftoneDots(size.x, size.y, { ink: 'x', shape: HALFTONE_SHAPES[name], cell })
        const random = mulberry32(size.x * 31 + name.length)
        for (let n = 0; n < 4000; n++) {
          const p = { x: random() * size.x, y: random() * size.y }
          const bruteForce = Math.max(...dots.map((d) => d.r - Math.hypot(p.x - d.x, p.y - d.y)))
          const shader = halftoneReach(p, size, grid)
          // Lejos del borde de un punto (> 0,01 px), los dos coinciden en dentro/fuera.
          if (Math.abs(bruteForce) > 0.01) expect(shader > 0).toBe(bruteForce > 0)
        }
      })
    }
  }
})

describe('recorte por la diagonal (§3.5, 1.1)', () => {
  const a = { x: 576, y: 900 }
  const b = { x: 851, y: 0 }

  it('RD-VIS-02 e: positiva del lado de la cuña y negativa del otro, a cualquier lado que caiga la cuña', () => {
    const right = { x: 1400, y: 450 }
    const left = { x: 10, y: 450 }
    expect(wedgeSide(right, a, b, right)).toBeGreaterThan(0)
    expect(wedgeSide(left, a, b, right)).toBeLessThan(0)
    expect(wedgeSide(left, a, b, left)).toBeGreaterThan(0)
    expect(wedgeSide(right, a, b, left)).toBeLessThan(0)
  })

  it('RD-VIS-02 e: es la distancia en px a la diagonal', () => {
    expect(Math.abs(wedgeSide(a, a, b, { x: 1400, y: 450 }))).toBeCloseTo(0)
    const horizontalA = { x: 0, y: 500 }
    const horizontalB = { x: 390, y: 500 }
    expect(wedgeSide({ x: 100, y: 520 }, horizontalA, horizontalB, { x: 0, y: 800 })).toBeCloseTo(20)
  })
})
