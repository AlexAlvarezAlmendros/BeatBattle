import { color } from '@beatbattle/shared/tokens'
import { describe, expect, it } from 'vitest'
import { contrastLevel, contrastRatio } from './contrast'

describe('contraste WCAG de la galería', () => {
  it('blanco sobre negro es 21:1 y un color sobre sí mismo, 1:1', () => {
    expect(contrastRatio(color.text, color.black)).toBeCloseTo(21, 5)
    expect(contrastRatio(color.ink800, color.ink800)).toBeCloseTo(1, 5)
  })

  it('RNF-A11Y-02: las cifras de la guía §2.17 y §3.2', () => {
    // #ff003c sobre negro: 5,3:1 (cualquier texto).
    expect(contrastRatio(color.red, color.black)).toBeCloseTo(5.3, 1)
    // …sobre #1a1a1a baja a 4,4:1 (solo texto grande e iconos).
    expect(contrastRatio(color.red, color.ink800)).toBeCloseTo(4.4, 1)
    // --bb-red-text: 5,4:1 sobre #1a1a1a.
    expect(contrastRatio(color.redText, color.ink800)).toBeGreaterThanOrEqual(5.3)
    // Blanco sobre --bb-red-cta: 4,7:1; sobre #ff003c no llega a 4,5 (3,9:1).
    expect(contrastRatio(color.text, color.redCta)).toBeCloseTo(4.7, 1)
    expect(contrastRatio(color.text, color.red)).toBeLessThan(4.5)
    // Etiqueta de las teselas: --bb-text-3 sobre --bb-ink-850 cumple AA.
    expect(contrastRatio(color.text3, color.ink850)).toBeGreaterThanOrEqual(4.5)
  })

  it('mezcla los colores con transparencia sobre el fondo', () => {
    // Blanco al 18 % sobre negro ≈ #2e2e2e.
    expect(contrastRatio(color.lineStrong, color.black)).toBeCloseTo(contrastRatio('#2e2e2e', color.black), 1)
  })

  it('niveles: AA, AA grande y no AA', () => {
    expect(contrastLevel(4.5)).toBe('aa')
    expect(contrastLevel(3.2)).toBe('aaLarge')
    expect(contrastLevel(2.9)).toBe('fail')
  })
})
