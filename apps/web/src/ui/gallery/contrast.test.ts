import { color } from '@beatbattle/shared/tokens'
import { describe, expect, it } from 'vitest'
import { CONTRAST_RULES, contrastLevel, contrastRatio, ruleRatio } from './contrast'

describe('contraste de la paleta (guía §3.2, RNF-A11Y-02)', () => {
  it('RNF-A11Y-02: cada par de la tabla de §3.2 da el ratio de la guía, calculado sobre los tokens', () => {
    for (const rule of CONTRAST_RULES) {
      const name = `${rule.text} sobre ${rule.surface}`
      expect(Math.round(ruleRatio(rule) * 100) / 100, name).toBeCloseTo(rule.expected, 2)
    }
  })

  it('RNF-A11Y-02: el uso de cada par es coherente con su ratio (AA normal ≥ 4,5; grande ≥ 3)', () => {
    for (const rule of CONTRAST_RULES) {
      const ratio = ruleRatio(rule)
      const name = `${rule.text} sobre ${rule.surface}`
      if (rule.use === 'anyText' || rule.use === 'pressed') expect(contrastLevel(ratio), name).toBe('aa')
      if (rule.use === 'largeText') expect(contrastLevel(ratio), name).toBe('aaLarge')
      // «Negro sobre #e6003a: no se usa», aunque pasaría como texto grande.
      if (rule.use === 'unused') expect(ratio, name).toBeLessThan(4.5)
    }
  })

  it('RNF-A11Y-02: el rojo de marca vale para texto pequeño sobre negro, paneles y la cuña, y no sobre granate', () => {
    for (const background of ['black', 'panel', 'panel2', 'wine2'] as const) {
      expect(contrastRatio(color.red, color[background]), background).toBeGreaterThanOrEqual(4.5)
    }
    expect(contrastRatio(color.red, color.wine)).toBeLessThan(4.5)
    expect(contrastRatio(color.red, color.ink3)).toBeLessThan(4.5)
  })

  it('RNF-A11Y-02: el texto sobre rojo es negro sobre #ff003c o blanco sobre #e6003a', () => {
    expect(contrastRatio(color.black, color.red)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(color.white, color.redCta)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(color.white, color.red)).toBeLessThan(4.5)
  })

  it('mezcla un primer plano con transparencia sobre su fondo antes de medir', () => {
    // Borde en reposo (blanco al 32 %) sobre negro: un gris (#525252), 2,67:1; opaco sería 21:1.
    const ratio = contrastRatio(color.lineStrong, color.black)
    expect(ratio).toBeCloseTo(2.67, 2)
    expect(ratio).toBeLessThan(contrastRatio(color.white, color.black))
  })
})
