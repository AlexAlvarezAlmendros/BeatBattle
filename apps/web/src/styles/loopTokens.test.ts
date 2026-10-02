import { cssVarName, loop } from '@beatbattle/shared/tokens'
import { describe, expect, it } from 'vitest'
import tokensCss from './tokens.css?raw'

/** Variables `--bb-loop-*` declaradas en el `:root` principal de tokens.css (sin comentarios). */
function loopVariables(): Map<string, string> {
  const source = tokensCss.replace(/\/\*[\s\S]*?\*\//g, '')
  const root = /:root\s*\{([\s\S]*?)\n\}/.exec(source)?.[1] ?? ''
  return new Map([...root.matchAll(/(--bb-loop-[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]))
}

describe('tokens: periodos de los bucles (--bb-loop-*) ↔ loop de @beatbattle/shared/tokens', () => {
  it('RD-VIS-01: cada periodo de tokens.ts existe en tokens.css con el mismo valor', () => {
    const css = loopVariables()
    for (const [key, ms] of Object.entries(loop)) {
      const name = cssVarName('loop', key)
      expect(css.get(name), name).toBe(`${ms / 1000}s`)
    }
    expect([...css.keys()].sort()).toEqual(
      Object.keys(loop)
        .map((key) => cssVarName('loop', key))
        .sort(),
    )
  })

  it('RNF-A11Y-03: «reducir movimiento» no cambia los periodos (la pieza pasa a su variante estática)', () => {
    const reducedBlocks = tokensCss.match(
      /prefers-reduced-motion[\s\S]*?\n\}|data-motion="reduced"\][\s\S]*?\n\}/g,
    )
    expect(reducedBlocks?.length).toBeGreaterThan(0)
    for (const block of reducedBlocks ?? []) expect(block).not.toMatch(/--bb-loop-/)
  })

  it('el teletipo sin movimiento rota cada 5 s (Anexo E)', () => {
    expect(loop.tickerStep).toBe(5000)
  })
})
