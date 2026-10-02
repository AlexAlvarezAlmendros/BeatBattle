import { cssVarName, loop, stagger } from '@beatbattle/shared/tokens'
import { describe, expect, it } from 'vitest'
import tokensCss from '../styles/tokens.css?raw'

/**
 * Los periodos de los bucles y los escalonados que usan los componentes (`--bb-loop-*`,
 * `--bb-stagger-*`) existen en `tokens.css` con el mismo valor que en `@beatbattle/shared/tokens`, y
 * no se recortan con «reducir movimiento» (si un bucle se acelerase, podría pasar de 3 destellos por
 * segundo: RNF-A11Y-04). El test de sincronía de `packages/shared` cubre colores, duraciones y curvas.
 */
const css = tokensCss.replace(/\/\*[\s\S]*?\*\//g, '')
const rootBlock = /:root\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? ''
const declared = (name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(rootBlock)?.[1]?.trim()
const reducedBlocks = [
  /@media \(prefers-reduced-motion: reduce\)\s*\{\s*:root\s*\{([\s\S]*?)\}/.exec(css)?.[1] ?? '',
  /:root\[data-motion="reduced"\]\s*\{([\s\S]*?)\}/.exec(css)?.[1] ?? '',
]

describe('tokens de movimiento de los componentes', () => {
  it('RD-VIS-01: cada bucle de tokens.ts está en tokens.css con el mismo periodo', () => {
    for (const [key, ms] of Object.entries(loop)) {
      expect(declared(cssVarName('loop', key)), key).toBe(`${ms}ms`)
    }
    const cssLoops = [...rootBlock.matchAll(/(--bb-loop-[\w-]+):/g)].map((m) => m[1])
    expect(cssLoops.sort()).toEqual(
      Object.keys(loop)
        .map((key) => cssVarName('loop', key))
        .sort(),
    )
  })

  it('RD-VIS-01: los escalonados coinciden', () => {
    for (const [key, ms] of Object.entries(stagger)) {
      expect(declared(cssVarName('stagger', key)), key).toBe(`${ms}ms`)
    }
  })

  it('RNF-A11Y-04: ningún bucle destella más de 3 veces por segundo ni cambia con «reducir movimiento»', () => {
    for (const ms of Object.values(loop)) expect(1000 / ms).toBeLessThanOrEqual(3)
    expect(reducedBlocks.every((block) => block.length > 0)).toBe(true)
    for (const block of reducedBlocks) expect(block).not.toMatch(/--bb-loop-|--bb-stagger-/)
  })
})
