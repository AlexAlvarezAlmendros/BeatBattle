import { describe, expect, it } from 'vitest'

/**
 * Rendimiento (§4.17, `RNF-PERF-03`): las animaciones de una sola pasada de los componentes no usan
 * `animation-fill-mode` `forwards` ni `both`. Una animación terminada con relleno hacia delante sigue
 * «en efecto» para siempre y Chrome la recalcula en cada fotograma mientras corre cualquier bucle de
 * la página: con la onda y la cuenta atrás de la galería eran más de 4000 y la página caía de 61 a
 * 28 fps. Cada pieza termina en su estilo natural; `backwards` sí vale (cubre el retardo escalonado).
 */
const sheets = import.meta.glob<string>('./**/*.module.css', {
  query: '?raw',
  import: 'default',
  eager: true,
})

/** Declaraciones `animation` y `animation-fill-mode` de una hoja, sin comentarios. */
function animationDeclarations(css: string): string[] {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  return [...bare.matchAll(/animation(?:-fill-mode)?\s*:\s*([^;]+);/g)].map((match) => match[1]!.trim())
}

describe('animaciones de los componentes', () => {
  it('RNF-PERF-03: hay hojas que revisar (el glob encuentra los CSS de ui/)', () => {
    expect(Object.keys(sheets).length).toBeGreaterThan(10)
  })

  it('RNF-PERF-03: ninguna animación se queda «en efecto» al terminar (ni forwards ni both)', () => {
    for (const [file, css] of Object.entries(sheets)) {
      for (const value of animationDeclarations(css)) {
        expect(value, `${file}: animation ${value}`).not.toMatch(/(^|\s)(forwards|both)(\s|,|$)/)
      }
    }
  })
})
