import { describe, expect, it } from 'vitest'
import {
  COVER_FAMILIES,
  coverDots,
  coverSpec,
  INK_RED,
  INK_WHITE,
  inkShare,
  REFERENCE_COVER,
  referenceCoverDots,
  solveScale,
} from '../src/index'

const within = (value: number, target: number, tolerance: number) =>
  Math.abs(value - target) <= target * tolerance

describe('@beatbattle/covers: emblema de puntos (§3.4.5, portado de final.js)', () => {
  it('es determinista: la misma semilla da los mismos puntos', () => {
    expect(coverDots('entrada-1')).toEqual(coverDots('entrada-1'))
    expect(coverDots('entrada-1')).not.toEqual(coverDots('entrada-2'))
  })

  it('la portada de referencia es la de las maquetas: espiral, tonalidad 4 (7 pliegues), 92 BPM', () => {
    expect(REFERENCE_COVER).toEqual({ seed: 'referencia', options: { family: 0, key: 4, bpm: 92 } })
    const { spec } = referenceCoverDots()
    expect(COVER_FAMILIES[spec.family]).toBe('espiral')
    expect(spec.folds).toBe(7)
    expect(spec.rings).toBe(13)
  })

  it('RD-VIS-04 (geometría): la tinta roja es el 11,5 % del disco y la blanca el 1,6 % (±5 %), en la referencia', () => {
    const ref = referenceCoverDots()
    expect(within(inkShare(ref.red), INK_RED, 0.05)).toBe(true)
    expect(within(inkShare(ref.white), INK_WHITE, 0.05)).toBe(true)
    expect(ref.red.every((dot) => dot.r > 0 && dot.r <= ref.rmax)).toBe(true)
  })

  it('RD-VIS-04 (geometría): el mismo presupuesto de tinta con 48 semillas, de todas las familias', () => {
    const families = new Set<number>()
    for (let index = 0; index < 48; index += 1) {
      const dots = coverDots(`entrada-${index}`)
      families.add(dots.spec.family)
      expect(within(inkShare(dots.red), INK_RED, 0.05), `semilla ${index}`).toBe(true)
      expect(within(inkShare(dots.white), INK_WHITE, 0.05), `semilla ${index}`).toBe(true)
    }
    expect(families.size).toBe(COVER_FAMILIES.length)
  })

  it('solveScale encuentra el factor que da el área pedida (con el tope de radio)', () => {
    const k = solveScale([0.1, 0.2], 1, Math.PI * 0.05)
    expect(Math.PI * ((0.1 * k) ** 2 + (0.2 * k) ** 2)).toBeCloseTo(Math.PI * 0.05, 6)
    expect(coverSpec('x', { key: 11 }).folds).toBe(3 + (11 % 6))
  })
})
