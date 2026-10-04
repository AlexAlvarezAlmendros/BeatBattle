/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  angle,
  type CubicBezier,
  color,
  cssVar,
  cssVarName,
  duration,
  ease,
  font,
  length,
  lengthMobile,
  logo,
  loop,
  loopVinylMs,
  medal,
  REDUCED_MOTION_MAX_MS,
  reducedDuration,
  spring,
  stagger,
  type TokenGroup,
  texture,
  textureMobile,
  toCssCubicBezier,
  toKebab,
  toRgba01,
  zIndex,
} from '../src/tokens'

/**
 * Lee las variables CSS de `tokens.css` agrupadas por el bloque que las declara
 * (`:root`, `@media (…) > :root`, `:root[data-motion="reduced"]`).
 */
function parseCustomProperties(css: string): Map<string, Map<string, string>> {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const blocks = new Map<string, Map<string, string>>()
  const stack: string[] = []
  let buffer = ''
  const flushDeclaration = () => {
    const match = /^\s*(--[\w-]+)\s*:\s*([\s\S]+?)\s*$/.exec(buffer)
    if (match && stack.length > 0) {
      const path = stack.join(' > ')
      if (!blocks.has(path)) blocks.set(path, new Map())
      blocks.get(path)!.set(match[1]!, match[2]!.replace(/\s+/g, ' '))
    }
    buffer = ''
  }
  for (const char of source) {
    if (char === '{') {
      stack.push(buffer.trim().replace(/\s+/g, ' '))
      buffer = ''
    } else if (char === '}') {
      flushDeclaration()
      stack.pop()
    } else if (char === ';') {
      flushDeclaration()
    } else {
      buffer += char
    }
  }
  return blocks
}

/** La fuente de verdad: se lee del disco para que el test vea exactamente lo que sirve la web. */
const tokensCss = readFileSync(new URL('../../../apps/web/src/styles/tokens.css', import.meta.url), 'utf8')
const blocks = parseCustomProperties(tokensCss)
const root = blocks.get(':root') ?? new Map<string, string>()
const mobile = blocks.get('@media (max-width: 720px) > :root') ?? new Map<string, string>()
const reducedBlocks = [
  blocks.get('@media (prefers-reduced-motion: reduce) > :root'),
  blocks.get(':root[data-motion="reduced"]'),
]
const serious = blocks.get(':root[data-serious]')

const isColorLiteral = (value: string) => /^(#[0-9a-f]{3,8}|rgba?\([^)]*\))$/i.test(value)

function parseCubicBezier(value: string): CubicBezier {
  const match = /^cubic-bezier\(([^)]*)\)$/.exec(value)
  if (!match) throw new Error(`No es una curva: ${value}`)
  const numbers = match[1]!.split(',').map((n) => Number(n.trim()))
  expect(numbers).toHaveLength(4)
  return numbers as unknown as CubicBezier
}

/** `1500ms` → 1500, `5s` → 5000. */
function toMs(value: string | undefined): number | undefined {
  const match = /^(\d+(?:\.\d+)?)(ms|s)$/.exec(value ?? '')
  if (!match) return undefined
  return Number(match[1]) * (match[2] === 's' ? 1000 : 1)
}

/** `14px` → 14, `35rem` → 560, `30deg` → 30, `0.74` → 0.74, `520` → 520. */
function toNumber(value: string | undefined): number | undefined {
  const match = /^(-?\d*\.?\d+)(px|rem|deg)?$/.exec(value ?? '')
  if (!match) return undefined
  return Number(match[1]) * (match[2] === 'rem' ? 16 : 1)
}

function expectSameColor(actual: string, expected: string) {
  const a = toRgba01(actual)
  const b = toRgba01(expected)
  a.forEach((channel, i) => {
    expect(channel).toBeCloseTo(b[i]!, 3)
  })
}

/** Comprueba un grupo numérico entero: mismos valores y ninguna variable de más con ese prefijo. */
function expectNumericGroup(
  group: TokenGroup,
  mirror: Readonly<Record<string, number>>,
  unit: 'px' | 'deg' | 'any',
  block = root,
) {
  for (const [key, expected] of Object.entries(mirror)) {
    const name = cssVarName(group, key)
    const css = block.get(name)
    expect(css, `${name} no existe en tokens.css`).toBeDefined()
    if (unit !== 'any') expect(css, name).toMatch(new RegExp(`${unit}$`))
    expect(toNumber(css), name).toBeCloseTo(expected, 6)
  }
}

describe('tokens: tokens.css ↔ tokens.ts', () => {
  it('RD-VIS-01: tokens.css declara sus variables en :root, en móvil, en los dos bloques de «reducir movimiento» y en el modo serio', () => {
    expect(root.size).toBeGreaterThan(100)
    expect(mobile.size).toBeGreaterThan(0)
    expect(reducedBlocks[0]).toBeDefined()
    expect(reducedBlocks[1]).toBeDefined()
    expect(serious?.get('--bb-fx')).toBe('0')
    expect(root.get('--bb-fx')).toBe('1')
    expect(root.get('--bb-motion')).toBe('1')
  })

  it('RD-VIS-01: la paleta de §3.2 tiene los cuatro colores del sello y sus derivados, con los valores de la guía', () => {
    expect(color.black).toBe('#000000')
    expect(color.red).toBe('#ff003c')
    expect(color.white).toBe('#ffffff')
    expect(color.wine).toBe('#4a0d1c')
    expect(color.redCta).toBe('#e6003a')
    expect(color.panelVeil).toBe('rgba(6, 6, 8, 0.94)')
    expect(color.text4).toBe('#757575')
  })

  it('RD-VIS-01: cada color de tokens.ts existe en tokens.css con el mismo valor', () => {
    for (const [key, value] of Object.entries(color)) {
      const name = cssVarName('color', key)
      const css = root.get(name)
      expect(css, `${name} no existe en tokens.css`).toBeDefined()
      expectSameColor(css!, value)
    }
  })

  it('RD-VIS-01: cada color literal de tokens.css está espejado en tokens.ts', () => {
    const mirrored = new Set(Object.keys(color).map((key) => cssVarName('color', key)))
    const literalColors = [...root].filter(([, value]) => isColorLiteral(value)).map(([name]) => name)
    expect(literalColors.length).toBeGreaterThan(20)
    for (const name of literalColors) expect(mirrored, `${name} falta en tokens.ts`).toContain(name)
  })

  it('RD-VIS-01: las medallas se pintan con la paleta (oro rojo, platino blanco, diamante granate)', () => {
    for (const [place, key] of Object.entries(medal)) {
      expect(root.get(`--bb-medal-${place}`)).toBe(`var(${cssVarName('color', key)})`)
    }
  })

  it('RD-VIS-01: las familias tipográficas son las de §3.2', () => {
    for (const [key, value] of Object.entries(font)) expect(root.get(cssVarName('font', key))).toBe(value)
    expect(font.display).toMatch(/^"Anybody"/)
    expect(font.ui).toMatch(/^"Chakra Petch"/)
    expect(font.num).toMatch(/^"Oxanium"/)
  })

  it('RD-VIS-01: chaflanes, paralelogramos, diagonal y trazos coinciden (y en móvil)', () => {
    expectNumericGroup('length', length, 'px')
    expectNumericGroup('length', lengthMobile, 'px', mobile)
    // Los cinco chaflanes de §3.2, de menor a mayor.
    expect([length.cutXs, length.cutSm, length.cutMd, length.cut, length.cutLg]).toEqual([5, 7, 10, 14, 22])
    const cssCuts = [...root.keys()].filter((name) => /^--bb-cut(-|$)/.test(name))
    expect(cssCuts.sort()).toEqual(
      ['cutXs', 'cutSm', 'cutMd', 'cut', 'cutLg'].map((key) => cssVarName('length', key)).sort(),
    )
  })

  it('RD-VIS-01: la diagonal y las inclinaciones coinciden', () => {
    expectNumericGroup('angle', angle, 'deg')
    const cssTilts = [...root.keys()].filter((name) => name.startsWith('--bb-tilt-'))
    expect(cssTilts).toHaveLength(Object.keys(angle).filter((key) => key.startsWith('tilt')).length)
  })

  it('RD-VIS-01: los parámetros de las texturas coinciden y no falta ninguno (y en móvil)', () => {
    expectNumericGroup('texture', texture, 'any')
    expectNumericGroup('texture', textureMobile, 'any', mobile)
    const numericTex = [...root].filter(
      ([name, value]) => name.startsWith('--bb-tex-') && !isColorLiteral(value),
    )
    expect(numericTex.map(([name]) => name).sort()).toEqual(
      Object.keys(texture)
        .map((key) => cssVarName('texture', key))
        .sort(),
    )
  })

  it('RD-VIS-01: los trazos del logo coinciden', () => {
    expectNumericGroup('logo', logo, 'any')
  })

  it('RD-VIS-01: las duraciones coinciden en milisegundos y no falta ninguna', () => {
    for (const [key, ms] of Object.entries(duration)) {
      expect(root.get(cssVarName('duration', key))).toBe(`${ms}ms`)
    }
    const cssDurations = [...root.keys()].filter((name) => name.startsWith('--bb-dur-'))
    expect(cssDurations.sort()).toEqual(
      Object.keys(duration)
        .map((key) => cssVarName('duration', key))
        .sort(),
    )
  })

  it('RD-VIS-01: las curvas coinciden y no falta ninguna', () => {
    for (const [key, curve] of Object.entries(ease)) {
      expect(parseCubicBezier(root.get(cssVarName('ease', key))!)).toEqual(curve)
    }
    const cssCurves = [...root.keys()].filter((name) => name.startsWith('--bb-ease-'))
    expect(cssCurves.sort()).toEqual(
      Object.keys(ease)
        .map((key) => cssVarName('ease', key))
        .sort(),
    )
  })

  it('RD-VIS-01: los periodos de los bucles (--bb-loop-*) coinciden y no falta ninguno', () => {
    for (const [key, ms] of Object.entries(loop)) {
      const name = cssVarName('loop', key)
      expect(toMs(root.get(name)), name).toBe(ms)
    }
    const cssLoops = [...root.keys()].filter((name) => name.startsWith('--bb-loop-'))
    expect(cssLoops.sort()).toEqual(
      Object.keys(loop)
        .map((key) => cssVarName('loop', key))
        .sort(),
    )
  })

  it('RD-VIS-01: los escalonados (--bb-stagger-*) coinciden y no falta ninguno', () => {
    for (const [key, ms] of Object.entries(stagger)) {
      expect(root.get(cssVarName('stagger', key))).toBe(`${ms}ms`)
    }
    const cssStaggers = [...root.keys()].filter((name) => name.startsWith('--bb-stagger-'))
    expect(cssStaggers).toHaveLength(Object.keys(stagger).length)
  })

  it('RNF-A11Y-04: ningún bucle destella más de 3 veces por segundo (el vinilo-sol tampoco, ni a 240 BPM)', () => {
    for (const ms of Object.values(loop)) expect(1000 / ms).toBeLessThanOrEqual(3)
    expect(1000 / loopVinylMs(240)).toBeLessThanOrEqual(3)
  })

  it('el vinilo-sol da una vuelta por compás: 92 BPM ≈ 2,6 s (§3.6)', () => {
    expect(loopVinylMs(92)).toBeCloseTo(2608.7, 1)
    expect(() => loopVinylMs(0)).toThrow()
  })

  it('RNF-A11Y-03: «reducir movimiento» no cambia bucles ni escalonados (la pieza pasa a su variante estática)', () => {
    for (const block of reducedBlocks) {
      for (const name of block!.keys()) expect(name).not.toMatch(/^--bb-(loop|stagger)-/)
    }
  })

  it('RD-VIS-01: los tokens de :root solo usan variables declaradas en :root', () => {
    // Una variable resuelve sus `var()` en el elemento que la declara: si un token de :root usara una
    // variable que pone cada pieza, los descendientes heredarían el valor ya resuelto.
    for (const [name, value] of root) {
      for (const [, used] of value.matchAll(/var\(\s*(--[\w-]+)/g)) {
        expect(root.has(used!), `${name} usa ${used}, que no está declarada en :root`).toBe(true)
      }
    }
  })

  it('RD-VIS-01: las capas coinciden con el orden de §3.2', () => {
    for (const [key, z] of Object.entries(zIndex)) expect(root.get(cssVarName('zIndex', key))).toBe(String(z))
    const cssLayers = [...root.keys()].filter((name) => name.startsWith('--bb-z-'))
    expect(cssLayers).toHaveLength(Object.keys(zIndex).length)
    const order = Object.values(zIndex)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('RD-VIS-01: los muelles documentados en tokens.css son los de tokens.ts', () => {
    const doc = (label: string) => {
      const match = new RegExp(`${label}\\s+\\{ stiffness: (\\d+), damping: (\\d+) \\}`).exec(tokensCss)
      return match ? { stiffness: Number(match[1]), damping: Number(match[2]) } : undefined
    }
    expect(doc('interacción')).toEqual(spring.interaction)
    expect(doc('recompensa')).toEqual(spring.reward)
  })

  it('RD-VIS-01: solo sombras duras; la única difusa es el halo del foco', () => {
    for (const name of ['--bb-shadow-hard', '--bb-shadow-hard-sm', '--bb-shadow-drop']) {
      // `x y 0 color`: el tercer valor (desenfoque) es 0.
      expect(root.get(name), name).toMatch(/^\d+px \d+px 0 /)
    }
    const shadows = [...root.keys()].filter((name) => name.startsWith('--bb-shadow-'))
    expect(shadows.sort()).toEqual(['--bb-shadow-drop', '--bb-shadow-hard', '--bb-shadow-hard-sm'])
    expect(root.get('--bb-focus-halo')).toBe('0 0 0 var(--bb-focus-halo-spread) rgba(255, 0, 60, 0.35)')
    expect(root.get('--bb-focus-halo-spread')).toBe('10px')
  })

  it('RD-VIS-01: los tokens del sello retirados en la v0.6 ya no existen', () => {
    const retired = [
      /^--bb-glass/,
      /^--nav-/,
      /^--bb-radius-/,
      /^--bb-shadow-(cta|glass|hero|card|float|glow|chip|playhead|dot)/,
      /^--bb-blur-/,
      /^--bb-space-(cta|nav|marquee)/,
      /^--bb-red-(line|rule|text|hover|glow|wash)$/,
      /^--bb-(success|danger)$/,
      /^--bb-(gold|platinum|diamond)/,
      /^--bb-loop-orb/,
    ]
    const names = [...blocks.values()].flatMap((block) => [...block.keys()])
    for (const name of names) {
      for (const pattern of retired) expect(name, `${name} es un token retirado`).not.toMatch(pattern)
    }
  })

  it('RNF-A11Y-03: con «reducir movimiento» las duraciones son las de reducedDuration y ninguna pasa de 200 ms', () => {
    for (const block of reducedBlocks) {
      for (const [key, ms] of Object.entries(reducedDuration)) {
        const name = cssVarName('duration', key)
        expect(block!.get(name) ?? root.get(name)).toBe(`${ms}ms`)
        expect(ms).toBeLessThanOrEqual(REDUCED_MOTION_MAX_MS)
      }
      expect(block!.get('--bb-motion')).toBe('0')
      expect(block!.get('--bb-ease-back')).toBe('var(--bb-ease-out)')
      expect(block!.get('--bb-ease-snap')).toBe('var(--bb-ease-out)')
    }
    expect([...reducedBlocks[0]!]).toEqual([...reducedBlocks[1]!])
  })
})

describe('tokens: utilidades', () => {
  it('toKebab separa palabras y cifras como los nombres de tokens.css', () => {
    expect(toKebab('lineStrong')).toBe('line-strong')
    expect(toKebab('wine2')).toBe('wine-2')
    expect(toKebab('text2')).toBe('text-2')
    expect(toKebab('inOut')).toBe('in-out')
    expect(cssVarName('color', 'panelVeil')).toBe('--bb-panel-veil')
    expect(cssVarName('length', 'cutMd')).toBe('--bb-cut-md')
    expect(cssVarName('length', 'cut')).toBe('--bb-cut')
    expect(cssVarName('length', 'stroke')).toBe('--bb-stroke')
    expect(cssVarName('angle', 'tiltSticker')).toBe('--bb-tilt-sticker')
    expect(cssVarName('texture', 'halftoneCellPiece')).toBe('--bb-tex-halftone-cell-piece')
    expect(cssVarName('logo', 'stepX')).toBe('--bb-logo-step-x')
    expect(cssVarName('loop', 'chronicle')).toBe('--bb-loop-chronicle')
    expect(cssVarName('stagger', 'wave')).toBe('--bb-stagger-wave')
    expect(cssVar('length', 'cutXs')).toBe('var(--bb-cut-xs)')
  })

  it('toRgba01 entiende hex de 3, 4, 6 y 8 cifras y rgba()', () => {
    expect(toRgba01('#fff')).toEqual([1, 1, 1, 1])
    expect(toRgba01('#ff003c')).toEqual([1, 0, 60 / 255, 1])
    expect(toRgba01('#2b2b2bce')[3]).toBeCloseTo(0xce / 255)
    expect(toRgba01('rgba(255, 0, 60, 0.4)')).toEqual([1, 0, 60 / 255, 0.4])
    expect(toRgba01('rgb(0,0,0)')).toEqual([0, 0, 0, 1])
    expect(() => toRgba01('red')).toThrow()
  })

  it('toCssCubicBezier vuelve a la sintaxis de CSS', () => {
    expect(toCssCubicBezier(ease.out)).toBe('cubic-bezier(0.22, 1, 0.36, 1)')
    expect(toCssCubicBezier(ease.snap)).toBe('cubic-bezier(0.2, 1.4, 0.4, 1)')
  })
})
