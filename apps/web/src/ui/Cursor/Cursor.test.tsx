import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { t } from '../../i18n'
import { Cursor } from './Cursor'
import cursorCss from './cursor.css?raw'

/** CSS sin comentarios y con los espacios normalizados (el formateador parte los selectores largos). */
const css = cursorCss
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\s+/g, ' ')
  .replace(/\(\s+/g, '(')
  .replace(/\s+\)/g, ')')

describe('Cursor (§3.3 «El foco es el cursor», RD-MOT-05)', () => {
  it('pinta el anillo con chaflán por defecto, decorativo, sin etiqueta 1P', () => {
    const { container } = render(
      <button type="button" data-cursor="">
        <Cursor />
        Jugar
      </button>,
    )
    const ring = container.querySelector('[data-cursor-ring]')
    expect(ring).toHaveAttribute('data-cursor-ring', 'cut')
    expect(ring).toHaveAttribute('data-cursor-cut', 'base')
    expect(ring).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('[data-cursor-player]')).toBeNull()
    // El nombre del control no cambia por llevar el cursor.
    expect(screen.getByRole('button', { name: 'Jugar' })).toHaveAttribute('data-cursor', '')
  })

  it('paralelogramo y etiqueta 1P a la izquierda (listas) o encima (rejillas), oculta a los lectores', () => {
    const { container, rerender } = render(<Cursor shape="slant" slant="sm" player />)
    expect(container.querySelector('[data-cursor-ring]')).toHaveAttribute('data-cursor-ring', 'slant')
    expect(container.querySelector('[data-cursor-ring]')).toHaveAttribute('data-cursor-slant', 'sm')
    const player = container.querySelector('[data-cursor-player]')!
    expect(player).toHaveAttribute('data-cursor-player', 'left')
    expect(player).toHaveTextContent(t('ui.cursor.player'))
    expect(player).toHaveAttribute('aria-hidden', 'true')
    expect(player).toHaveAttribute('data-tag', 'cta')
    rerender(<Cursor cut="md" player="top" />)
    expect(container.querySelector('[data-cursor-player]')).toHaveAttribute('data-cursor-player', 'top')
    expect(container.querySelector('[data-cursor-ring]')).toHaveAttribute('data-cursor-cut', 'md')
  })

  it('RNF-A11Y-01: marco blanco de 3 px separado 4 px de la pieza (tokens de trazo)', () => {
    expect(css).toMatch(/--cursor-reach: calc\(var\(--bb-cursor-gap\) \+ var\(--bb-stroke-cursor\)\)/)
    expect(css).toMatch(/inset: calc\(-1 \* var\(--cursor-reach\)\)/)
    expect(css).toMatch(/background: var\(--bb-white\)/)
    expect(css).toMatch(/--cursor-s: var\(--bb-stroke-cursor\)/)
  })

  it('RD-VIS-01: sigue el chaflán de la pieza con calc() sobre los tokens (nunca un número suelto)', () => {
    expect(css).toMatch(
      /--cursor-outer-cut: calc\(var\(--cursor-piece-cut\) \+ var\(--cursor-reach\) \* 0\.586\)/,
    )
    expect(css).toMatch(
      /--cursor-inner-cut: calc\(var\(--cursor-piece-cut\) \+ var\(--bb-cursor-gap\) \* 0\.586\)/,
    )
    expect(css).toMatch(/clip-path: polygon\(\s*evenodd,/)
    expect(css).toMatch(/--cursor-slant-outer: calc\(var\(--cursor-piece-slant\) \+ var\(--cursor-s\)\)/)
  })

  it('RD-MOT-05: se ve en la opción enfocada, en la forzada y en la elegida si el foco está fuera del grupo', () => {
    expect(css).toMatch(
      /\[data-cursor\]:focus, \[data-cursor\]\[data-force-state="focus"\]\) > :is\(\[data-cursor-ring\], \[data-cursor-player\]\)/,
    )
    expect(css).toMatch(
      /\[data-cursor-group\]:not\(:focus-within\) \[data-cursor\]\[data-cursor-active="true"\]/,
    )
  })

  it('RNF-A11Y-03: el salto del cursor se multiplica por --bb-motion (sin movimiento, salto instantáneo)', () => {
    expect(css).toMatch(/animation: bb-cursor-in var\(--bb-dur-tick\) var\(--bb-ease-snap\)/)
    expect(css).toMatch(/scale: calc\(1 \+ 0\.06 \* var\(--bb-motion\)\)/)
  })
})
