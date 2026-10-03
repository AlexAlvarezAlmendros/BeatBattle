import { logo } from '@beatbattle/shared/tokens'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GameLogo } from './GameLogo'

describe('GameLogo (§3.2 «Trazos», §3.8.1; 0.24)', () => {
  it('es decorativo, con la extrusión de 12 capas y el contorno como filtro', () => {
    const { container } = render(<GameLogo />)
    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('data-game-logo', 'full')
    // 12 capas de extrusión (con las dos palabras cada una) más la cara.
    expect(svg.querySelectorAll('g[transform] text')).toHaveLength(logo.depth * 2)
    expect(svg.querySelectorAll('feMorphology')).toHaveLength(2)
    expect(svg.querySelector('feMorphology')).toHaveAttribute('radius', String(logo.outline))
  })

  it('dos logos en la misma página no comparten ids de degradados ni filtros', () => {
    const { container } = render(
      <>
        <GameLogo />
        <GameLogo compact />
      </>,
    )
    const ids = [...container.querySelectorAll('[id]')].map((element) => element.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
