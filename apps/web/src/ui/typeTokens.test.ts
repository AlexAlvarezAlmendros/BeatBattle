import { describe, expect, it } from 'vitest'
import tokensCss from '../styles/tokens.css?raw'
import buttonCss from './Button/Button.module.css?raw'

/**
 * Los valores tipográficos que §3.2 fija para los componentes base (medidos en el sello,
 * `otp-metrics.json`): el interletraje de los botones y el titular del hero que enseña la galería.
 */
const css = tokensCss.replace(/\/\*[\s\S]*?\*\//g, '')
const declared = (name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(css)?.[1]?.trim()

describe('tokens tipográficos de los componentes', () => {
  it('RD-VIS-01: los botones van a 0,1 em de interletraje (0,08 em en móvil), como el sello', () => {
    expect(declared('--bb-tracking-cta')).toBe('0.1em')
    expect(declared('--bb-tracking-cta-compact')).toBe('0.08em')
    expect(buttonCss).toMatch(/letter-spacing:\s*var\(--bb-tracking-cta\)/)
  })

  it('RD-VIS-01: el titular del hero es el clamp del sello (96 px a 1440, 44,8 px a 390)', () => {
    expect(declared('--bb-font-size-hero')).toBe('clamp(2.8rem, 8vw, 6rem)')
  })
})
