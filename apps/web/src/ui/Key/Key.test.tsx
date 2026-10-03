import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { KEY_TONES, Key } from './Key'
import keyCss from './key.css?raw'

const css = keyCss.replace(/\/\*[\s\S]*?\*\//g, '')

describe('Key (§3.3 «Tecla»)', () => {
  it('pinta un <kbd> oscuro por defecto con su texto', () => {
    render(<Key>INTRO</Key>)
    const key = screen.getByText('INTRO')
    expect(key.tagName).toBe('KBD')
    expect(key).toHaveAttribute('data-key', 'dark')
  })

  it('tonos clara y marcada', () => {
    expect(KEY_TONES).toEqual(['dark', 'light', 'marked'])
    render(
      <>
        <Key tone="light">Q</Key>
        <Key tone="marked">4</Key>
      </>,
    )
    expect(screen.getByText('Q')).toHaveAttribute('data-key', 'light')
    expect(screen.getByText('4')).toHaveAttribute('data-key', 'marked')
  })

  it('RNF-A11Y-01: con `label`, el dibujo se oculta y se lee el nombre de la tecla', () => {
    render(<Key label="Flecha arriba">↑</Key>)
    expect(screen.getByText('↑')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText('Flecha arriba')).toHaveClass('sr-only')
  })

  it('se oculta a los lectores dentro de un control que ya dice su acción', () => {
    render(<Key aria-hidden="true">INTRO</Key>)
    expect(screen.getByText('INTRO')).toHaveAttribute('aria-hidden', 'true')
  })

  it('RD-VIS-01: chaflán --bb-cut-xs, 26 px de alto y Oxanium 12 px, todo por tokens', () => {
    expect(css).toMatch(/--key-cut: var\(--bb-cut-xs\)/)
    expect(css).toMatch(/height: calc\(var\(--bb-space-6\) \+ var\(--bb-stroke\)\)/)
    expect(css).toMatch(/font-family: var\(--bb-font-num\)/)
    expect(css).toMatch(/font-size: var\(--bb-fs-xs\)/)
    expect(css).toMatch(/\[data-key="marked"\]\) \{\s*--key-fill: var\(--bb-red-press\)/)
  })
})
