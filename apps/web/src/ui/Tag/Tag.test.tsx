import { color } from '@beatbattle/shared/tokens'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from '../gallery/contrast'
import { TAG_SIZES, TAG_TONES, Tag } from './Tag'
import tagCss from './tag.css?raw'

const css = tagCss.replace(/\/\*[\s\S]*?\*\//g, '')

describe('Tag (§3.3 «Etiqueta»)', () => {
  it('pinta una etiqueta blanca y pequeña por defecto', () => {
    render(<Tag>Nuevo</Tag>)
    const tag = screen.getByText('Nuevo')
    expect(tag).toHaveAttribute('data-tag', 'white')
    expect(tag).toHaveAttribute('data-tag-size', 'sm')
  })

  it('tonos blanca, roja y cta; tamaños de 12, 14 y 16 px', () => {
    expect(TAG_TONES).toEqual(['white', 'red', 'cta'])
    expect(TAG_SIZES).toEqual(['sm', 'md', 'lg'])
    render(
      <Tag tone="cta" size="lg">
        1P
      </Tag>,
    )
    expect(screen.getByText('1P')).toHaveAttribute('data-tag', 'cta')
    expect(screen.getByText('1P')).toHaveAttribute('data-tag-size', 'lg')
  })

  it('RD-VIS-01: paralelogramo de --bb-slant-sm en display cursiva', () => {
    expect(css).toMatch(/--tag-slant: var\(--bb-slant-sm\)/)
    expect(css).toMatch(
      /clip-path: polygon\(var\(--tag-slant\) 0, 100% 0, calc\(100% - var\(--tag-slant\)\) 100%, 0 100%\)/,
    )
    expect(css).toMatch(/font-family: var\(--bb-font-display\)/)
    expect(css).toMatch(/font-style: italic/)
  })

  it('RNF-A11Y-01: en contraste alto conserva su caja: sin recorte, borde CanvasText (Highlight en la 1P del cursor) y el mismo tamaño', () => {
    const forced = /@media \(forced-colors: active\) \{([\s\S]*)\}\s*$/.exec(css)?.[1] ?? ''
    expect(forced).toMatch(
      /:where\(\[data-tag\]\) \{[^}]*border: var\(--bb-stroke\) solid CanvasText;[^}]*\}/,
    )
    expect(forced).toMatch(/:where\(\[data-tag\]\) \{[^}]*clip-path: none;[^}]*\}/)
    // El borde se come el relleno: la caja mide lo mismo que sin contraste alto.
    expect(forced).toMatch(
      /:where\(\[data-tag\]\) \{[^}]*padding:[^;]*- var\(--bb-stroke\)\)[^;]*- var\(--bb-stroke\)\);/,
    )
    expect(forced).toMatch(/:where\(\[data-tag\]\[data-cursor-player\]\) \{\s*border-color: Highlight;/)
  })

  it('RNF-A11Y-02: cada tono pone el texto que pide §3.2 (negro sobre blanco y rojo, blanco sobre cta), AA a cualquier tamaño', () => {
    expect(css).toMatch(/\[data-tag="red"\]\) \{\s*background: var\(--bb-red\);\s*color: var\(--bb-black\)/)
    expect(css).toMatch(
      /\[data-tag="cta"\]\) \{\s*background: var\(--bb-red-cta\);\s*color: var\(--bb-white\)/,
    )
    expect(contrastRatio(color.black, color.red)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(color.white, color.redCta)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(color.black, color.white)).toBeGreaterThanOrEqual(4.5)
  })
})
