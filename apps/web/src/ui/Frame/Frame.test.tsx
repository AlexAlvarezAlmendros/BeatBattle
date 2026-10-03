import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FRAME_CUTS, FRAME_VARIANTS, Frame, frameAttributes } from './Frame'
import frameCss from './frame.css?raw'

/** Reglas del CSS del marco sin comentarios, para mirar qué declaran. */
const css = frameCss.replace(/\/\*[\s\S]*?\*\//g, '')

describe('Frame (§3.3 «Marco»)', () => {
  it('RD-VIS-01: pinta un div con la variante y el chaflán como atributos (panel y --bb-cut por defecto)', () => {
    render(<Frame data-testid="frame">Contenido</Frame>)
    const frame = screen.getByTestId('frame')
    expect(frame.tagName).toBe('DIV')
    expect(frame).toHaveAttribute('data-frame', 'panel')
    expect(frame).toHaveAttribute('data-frame-cut', 'base')
    expect(frame).toHaveTextContent('Contenido')
  })

  it('pinta el elemento que se le pida, con sus props', () => {
    render(
      <Frame as="button" type="button" variant="title" cut="md" aria-label="Elegir">
        X
      </Frame>,
    )
    const button = screen.getByRole('button', { name: 'Elegir' })
    expect(button).toHaveAttribute('data-frame', 'title')
    expect(button).toHaveAttribute('data-frame-cut', 'md')
    expect(button).toHaveAttribute('type', 'button')
  })

  it('frameAttributes convierte cualquier elemento en marco; el escenario puede ir sin trama', () => {
    expect(frameAttributes()).toEqual({ 'data-frame': 'panel', 'data-frame-cut': 'base' })
    expect(frameAttributes({ variant: 'stage', cut: 'lg', texture: false })).toEqual({
      'data-frame': 'stage',
      'data-frame-cut': 'lg',
      'data-frame-texture': 'off',
    })
    // La trama solo existe en el escenario.
    expect(frameAttributes({ variant: 'panel', texture: false })).not.toHaveProperty('data-frame-texture')
  })

  it('RD-VIS-01: dos capas recortadas con el mismo chaflán; el interior sale del exterior con calc() sobre el trazo', () => {
    expect(css).toMatch(/:where\(\[data-frame\]\)::before \{[^}]*background: var\(--frame-border\)/)
    expect(css).toMatch(/:where\(\[data-frame\]\)::after \{[^}]*inset: var\(--frame-stroke\)/)
    expect(css).toMatch(/--frame-cut-inner: calc\(var\(--frame-cut\) - var\(--frame-stroke\) \* 0\.586\)/)
    expect(css).toMatch(/--frame-stroke: var\(--bb-stroke\)/)
  })

  it('RD-VIS-01: cada variante y cada chaflán salen de los tokens de §3.2', () => {
    expect(FRAME_VARIANTS).toEqual(['panel', 'stage', 'title'])
    expect(FRAME_CUTS).toEqual(['xs', 'sm', 'md', 'base', 'lg'])
    expect(css).toMatch(
      /\[data-frame="panel"\]\) \{[^}]*--frame-border: var\(--bb-line-strong\);[^}]*--frame-fill: var\(--bb-panel-veil\)/,
    )
    expect(css).toMatch(
      /\[data-frame="stage"\]\) \{[^}]*--frame-border: var\(--bb-red\);[^}]*--frame-fill: var\(--bb-wine-3\)/,
    )
    expect(css).toMatch(/\[data-frame="title"\]\) \{[^}]*--frame-border: var\(--bb-white\)/)
    const cutToken = {
      xs: '--bb-cut-xs',
      sm: '--bb-cut-sm',
      md: '--bb-cut-md',
      base: '--bb-cut',
      lg: '--bb-cut-lg',
    }
    for (const cut of FRAME_CUTS) {
      expect(css, cut).toMatch(
        new RegExp(`\\[data-frame-cut="${cut}"\\]\\) \\{\\s*--frame-cut: var\\(${cutToken[cut]}\\)`),
      )
    }
  })

  it('las reglas del marco no pesan (`:where`): la pieza que lo usa cambia sus variables desde su clase', () => {
    const selectors = [...css.matchAll(/([^{}]+)\{/g)].map((m) => m[1]!.trim())
    for (const selector of selectors) expect(selector, selector).toMatch(/^:where\(/)
  })
})
