import { describe, expect, it } from 'vitest'
import fontsCss from '../styles/fonts.css?raw'
import tokensCss from '../styles/tokens.css?raw'

/**
 * Tipografía de la arena (guía §3.2 «Tipografía»): las tres familias alojadas con `@fontsource`, sus
 * pesos, el latino y el latino extendido por `unicode-range`, y los tokens que las nombran.
 */
const css = tokensCss.replace(/\/\*[\s\S]*?\*\//g, '')
const fonts = fontsCss.replace(/\/\*[\s\S]*?\*\//g, '')
const declared = (name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(css)?.[1]?.trim()

/** Las reglas `@font-face` de fonts.css, con sus descriptores. */
const faces = [...fonts.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) => {
  const get = (descriptor: string) => new RegExp(`${descriptor}:\\s*([^;]+);`).exec(body!)?.[1]?.trim()
  return {
    family: get('font-family')?.replace(/"/g, ''),
    style: get('font-style'),
    weight: get('font-weight'),
    src: get('src') ?? '',
    display: get('font-display'),
    range: get('unicode-range') ?? '',
  }
})

describe('tipografía de la arena (§3.2)', () => {
  it('RD-VIS-01: los tokens nombran Anybody, Chakra Petch y Oxanium', () => {
    expect(declared('--bb-font-display')).toMatch(/^"Anybody"/)
    expect(declared('--bb-font-ui')).toMatch(/^"Chakra Petch"/)
    expect(declared('--bb-font-num')).toMatch(/^"Oxanium"/)
  })

  it('RD-VIS-01: Anybody solo en cursiva, variable en peso y anchura (de 50 a 150 %)', () => {
    const anybody = faces.filter((face) => face.family === 'Anybody')
    expect(anybody).toHaveLength(2)
    for (const face of anybody) {
      expect(face.style).toBe('italic')
      expect(face.weight).toBe('100 900')
      expect(face.src).toMatch(
        /@fontsource-variable\/anybody\/files\/anybody-latin(-ext)?-standard-italic\.woff2/,
      )
    }
    expect(fonts).toMatch(/font-stretch: 50% 150%/)
  })

  it('RD-VIS-01: Chakra Petch 500, 600 y 700 rectas y 600 y 700 cursivas; Oxanium variable de 200 a 800', () => {
    const chakra = faces
      .filter((face) => face.family === 'Chakra Petch')
      .map((face) => `${face.weight} ${face.style}`)
    expect(new Set(chakra)).toEqual(
      new Set(['500 normal', '600 normal', '700 normal', '600 italic', '700 italic']),
    )
    const oxanium = faces.filter((face) => face.family === 'Oxanium')
    expect(oxanium.map((face) => face.weight)).toEqual(['200 800', '200 800'])
  })

  it('RNF-PERF-02: latino y latino extendido por unicode-range, font-display: swap en todas', () => {
    expect(faces).toHaveLength(2 + 10 + 2)
    for (const face of faces) {
      expect(face.display).toBe('swap')
      expect(face.src).toMatch(/-latin(-ext)?-/)
      expect(face.range).toMatch(face.src.includes('-latin-ext-') ? /^U\+0100-02BA/ : /^U\+0000-00FF/)
    }
  })

  it('RD-VIS-02 c: ni Montserrat ni JetBrains Mono', () => {
    expect(fonts).not.toMatch(/montserrat|jetbrains/i)
    expect(css).not.toMatch(/montserrat|jetbrains/i)
  })

  it('RD-VIS-05: el escalón más pequeño es 12 px', () => {
    expect(declared('--bb-fs-xs')).toBe('0.75rem')
  })
})
