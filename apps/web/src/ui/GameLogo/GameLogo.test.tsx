import { logo } from '@beatbattle/shared/tokens'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GameLogo, LOGO_LAYOUTS } from './GameLogo'

/** Lo que la cursiva de Anybody adelanta la parte alta de la última letra, en fracción del cuerpo. */
const ITALIC_OVERHANG = 0.15

describe('GameLogo (§3.2 «Trazos», §3.8.1; 0.24)', () => {
  it('es decorativo y se pinta en un canvas: ningún texto del logo puede ser el LCP (RNF-PERF-02)', () => {
    const { container } = render(
      <>
        <GameLogo />
        <GameLogo compact />
      </>,
    )
    const logos = container.querySelectorAll('[data-game-logo]')
    expect([...logos].map((element) => element.getAttribute('data-game-logo'))).toEqual(['full', 'compact'])
    for (const element of logos) {
      expect(element).toHaveAttribute('aria-hidden', 'true')
      expect(element.children).toHaveLength(1)
      expect(element.firstElementChild?.tagName).toBe('CANVAS')
    }
    expect(container.querySelector('svg, text')).toBeNull()
  })

  it('cada palabra, con su extrusión, su contorno y su filete, cabe en el lienzo de su composición', () => {
    const depthX = logo.depth * logo.stepX
    const depthY = logo.depth * logo.stepY
    const edge = logo.outline + logo.rim
    for (const layout of Object.values(LOGO_LAYOUTS)) {
      const [x, y, width, height] = layout.box
      expect(width).toBeGreaterThanOrEqual(logo.canvas)
      for (const line of layout.lines) {
        expect(line.x - edge).toBeGreaterThanOrEqual(x)
        expect(line.x + line.length + depthX + edge + ITALIC_OVERHANG * line.size).toBeLessThanOrEqual(
          x + width,
        )
        expect(line.y + depthY + edge).toBeLessThanOrEqual(y + height)
      }
    }
  })
})
