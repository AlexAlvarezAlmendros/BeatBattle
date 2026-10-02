/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  type CubicBezier,
  color,
  cssVarName,
  duration,
  ease,
  loop,
  REDUCED_MOTION_MAX_MS,
  reducedDuration,
  spring,
  stagger,
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
const reducedBlocks = [
  blocks.get('@media (prefers-reduced-motion: reduce) > :root'),
  blocks.get(':root[data-motion="reduced"]'),
]

const isColorLiteral = (value: string) => /^(#[0-9a-f]{3,8}|rgba?\([^)]*\))$/i.test(value)

function parseCubicBezier(value: string): CubicBezier {
  const match = /^cubic-bezier\(([^)]*)\)$/.exec(value)
  if (!match) throw new Error(`No es una curva: ${value}`)
  const numbers = match[1]!.split(',').map((n) => Number(n.trim()))
  expect(numbers).toHaveLength(4)
  return numbers as unknown as CubicBezier
}

/** `1500ms` → 1500, `35s` → 35000: los bucles largos van en segundos y los cortos en milisegundos. */
function toMs(value: string | undefined): number | undefined {
  const match = /^(\d+(?:\.\d+)?)(ms|s)$/.exec(value ?? '')
  if (!match) return undefined
  return Number(match[1]) * (match[2] === 's' ? 1000 : 1)
}

function expectSameColor(actual: string, expected: string) {
  const a = toRgba01(actual)
  const b = toRgba01(expected)
  a.forEach((channel, i) => {
    expect(channel).toBeCloseTo(b[i]!, 3)
  })
}

describe('tokens: tokens.css ↔ tokens.ts', () => {
  it('RD-VIS-01: tokens.css declara sus variables en :root y en los dos bloques de «reducir movimiento»', () => {
    expect(root.size).toBeGreaterThan(50)
    expect(reducedBlocks[0]).toBeDefined()
    expect(reducedBlocks[1]).toBeDefined()
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

  it('RNF-A11Y-04: ningún bucle destella más de 3 veces por segundo', () => {
    for (const ms of Object.values(loop)) expect(1000 / ms).toBeLessThanOrEqual(3)
  })

  it('RNF-A11Y-03: «reducir movimiento» no cambia bucles ni escalonados (la pieza pasa a su variante estática)', () => {
    for (const block of reducedBlocks) {
      for (const name of block!.keys()) expect(name).not.toMatch(/^--bb-(loop|stagger)-/)
    }
    // Anexo E: el teletipo sin movimiento rota cada 5 s.
    expect(loop.tickerStep).toBe(5000)
  })

  it('RD-VIS-01: los tokens de :root solo usan variables declaradas en :root', () => {
    // Una variable resuelve sus `var()` en el elemento que la declara: si un token de :root usara una
    // variable que pone cada pieza (p. ej. el ángulo del borde holográfico), los descendientes
    // heredarían el valor ya resuelto y el cambio de la pieza no tendría efecto.
    for (const [name, value] of root) {
      for (const [, used] of value.matchAll(/var\(\s*(--[\w-]+)/g)) {
        expect(root.has(used!), `${name} usa ${used}, que no está declarada en :root`).toBe(true)
      }
    }
  })

  it('RD-VIS-01: la rareza épica da las paradas y --bb-holo-angle está registrada para girar', () => {
    expect(root.get('--bb-rarity-epic-stops')).toBe(
      'var(--bb-red), var(--bb-diamond), var(--bb-platinum), var(--bb-gold), var(--bb-red)',
    )
    expect(root.has('--bb-rarity-epic-border')).toBe(false)
    const registration = /@property\s+--bb-holo-angle\s*\{([^}]*)\}/.exec(tokensCss)?.[1] ?? ''
    expect(registration).toMatch(/syntax:\s*"<angle>"/)
    expect(registration).toMatch(/inherits:\s*false/)
    expect(registration).toMatch(/initial-value:\s*0deg/)
  })

  it('RD-VIS-01: las capas coinciden', () => {
    for (const [key, z] of Object.entries(zIndex)) expect(root.get(cssVarName('zIndex', key))).toBe(String(z))
    const cssLayers = [...root.keys()].filter((name) => name.startsWith('--bb-z-'))
    expect(cssLayers).toHaveLength(Object.keys(zIndex).length)
  })

  it('RD-VIS-01: los muelles documentados en tokens.css son los de tokens.ts', () => {
    const doc = (label: string) => {
      const match = new RegExp(`${label}\\s+\\{ stiffness: (\\d+), damping: (\\d+) \\}`).exec(tokensCss)
      return match ? { stiffness: Number(match[1]), damping: Number(match[2]) } : undefined
    }
    expect(doc('interacción')).toEqual(spring.interaction)
    expect(doc('recompensa')).toEqual(spring.reward)
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
    }
    expect([...reducedBlocks[0]!]).toEqual([...reducedBlocks[1]!])
  })
})

describe('tokens: utilidades', () => {
  it('toKebab separa palabras y cifras como los nombres de tokens.css', () => {
    expect(toKebab('lineStrong')).toBe('line-strong')
    expect(toKebab('ink950')).toBe('ink-950')
    expect(toKebab('text2')).toBe('text-2')
    expect(toKebab('inOut')).toBe('in-out')
    expect(cssVarName('color', 'redGlow')).toBe('--bb-red-glow')
    expect(cssVarName('loop', 'orbDrift1')).toBe('--bb-loop-orb-drift-1')
    expect(cssVarName('loop', 'tickerStep')).toBe('--bb-loop-ticker-step')
    expect(cssVarName('stagger', 'wave')).toBe('--bb-stagger-wave')
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
  })
})
