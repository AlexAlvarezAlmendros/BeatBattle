import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { type MatchMediaController, mockMatchMedia } from '../hooks/mockMatchMedia'
import { DataTile } from './DataTile'
import tileCss from './DataTile.module.css?raw'
import { DATA_TILE_COMPACT_QUERY, DataTileSection } from './DataTileSection'

let media: MatchMediaController | null = null

afterEach(() => {
  media?.restore()
  media = null
})

function renderSection(props: { defaultExpanded?: boolean } = {}) {
  return render(
    <DataTileSection title="Información" titleAs="h3" {...props}>
      <DataTile icon="metronome" label="BPM" value="92" mono />
      <DataTile icon="sharp" label="Tonalidad" value="Re♯ menor" />
    </DataTileSection>,
  )
}

/** Bloque de una media query del CSS (jsdom no evalúa @media: se comprueban las reglas). */
const mediaBlock = (query: string) =>
  new RegExp(`@media ${query.replace(/[()]/g, '\\$&')} \\{([\\s\\S]*?)\\n\\}`).exec(tileCss)?.[1] ?? ''

describe('DataTileSection: rótulo de sección con sus teselas', () => {
  it('en escritorio, el rótulo es un encabezado y las teselas se ven siempre', () => {
    media = mockMatchMedia({ [DATA_TILE_COMPACT_QUERY]: false })
    renderSection()
    const heading = screen.getByRole('heading', { level: 3, name: 'Información' })
    expect(within(heading).queryByRole('button')).toBeNull()
    expect(screen.getAllByRole('term').map((el) => el.textContent)).toEqual(['BPM', 'Tonalidad'])
    expect(screen.getAllByRole('definition').map((el) => el.textContent)).toEqual(['92', 'Re♯ menor'])
  })

  it('RD-VIS-02: en móvil, el rótulo pliega la lista como en la ficha del sello (plegada al principio)', async () => {
    media = mockMatchMedia({ [DATA_TILE_COMPACT_QUERY]: true })
    renderSection()
    const heading = screen.getByRole('heading', { level: 3, name: 'Información' })
    const toggle = within(heading).getByRole('button', { name: 'Información' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    const list = document.getElementById(toggle.getAttribute('aria-controls') ?? '')
    expect(list?.tagName).toBe('DL')
    expect(list).not.toBeVisible()
    expect(screen.queryAllByRole('definition')).toEqual([])

    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(list).toBeVisible()
    expect(screen.getAllByRole('definition').map((el) => el.textContent)).toEqual(['92', 'Re♯ menor'])

    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(list).not.toBeVisible()
  })

  it('RNF-A11Y-01: en móvil se despliega con el teclado', async () => {
    media = mockMatchMedia({ [DATA_TILE_COMPACT_QUERY]: true })
    renderSection()
    await userEvent.tab()
    const toggle = screen.getByRole('button', { name: 'Información' })
    expect(toggle).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await userEvent.keyboard(' ')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('con `defaultExpanded`, en móvil empieza desplegada; al pasar a escritorio se ve siempre', () => {
    media = mockMatchMedia({ [DATA_TILE_COMPACT_QUERY]: true })
    renderSection({ defaultExpanded: true })
    expect(screen.getByRole('button', { name: 'Información' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('definition')).toHaveLength(2)
  })

  it('al ensanchar la ventana, la lista plegada vuelve a verse y el rótulo deja de ser un botón', async () => {
    media = mockMatchMedia({ [DATA_TILE_COMPACT_QUERY]: true })
    const { findByRole } = renderSection()
    expect(screen.queryAllByRole('definition')).toEqual([])
    act(() => media?.set(DATA_TILE_COMPACT_QUERY, false))
    const heading = await findByRole('heading', { level: 3, name: 'Información' })
    expect(within(heading).queryByRole('button')).toBeNull()
    expect(screen.getAllByRole('definition')).toHaveLength(2)
  })

  it('RD-VIS-02: en móvil, las teselas son una lista de clave y valor (BeatDetalle.css ≤ 768 px)', () => {
    const compact = mediaBlock(DATA_TILE_COMPACT_QUERY)
    expect(compact).toMatch(/\.list \{[^}]*grid-template-columns: 1fr;[^}]*gap: 0;/)
    expect(compact).toMatch(
      /\.tile \{[^}]*flex-direction: row;[^}]*justify-content: space-between;[^}]*border: 0;[^}]*border-bottom: 1px solid var\(--bb-panel-2\);[^}]*border-radius: 0;[^}]*background-color: transparent;/,
    )
    expect(compact).toMatch(/\.tile:last-child \{[^}]*border-bottom: 0;/)
    expect(compact).toMatch(/\.icon \{[^}]*display: none;/)
    expect(compact).toMatch(/\.label \{[^}]*font-size: var\(--bb-font-size-tile-key\);/)
    expect(compact).toMatch(/\.value \{[^}]*font-size: var\(--bb-fs-sm\);/)
    // La lista plegada no se pinta aunque `.list` sea una rejilla.
    expect(tileCss).toMatch(/\.list\[hidden\] \{[^}]*display: none;/)
  })

  it('RNF-A11Y-09: el rótulo plegable tiene un objetivo táctil de 44 px sin cambiar su alto', () => {
    expect(tileCss).toMatch(/\.sectionToggle \{[^}]*position: relative;/)
    expect(tileCss).toMatch(
      /\.sectionToggle::after \{[^}]*position: absolute;[^}]*inset: calc\(\(100% - var\(--bb-space-11\)\) \/ 2\) 0;/,
    )
  })

  it('RD-MOT-03: con «reducir movimiento», el chevron cambia de sentido sin girar', () => {
    expect(mediaBlock('(prefers-reduced-motion: reduce)')).toMatch(/\.chevron \{[^}]*transition: none;/)
    expect(tileCss).toMatch(/:global\(:root\[data-motion="reduced"\]\) \.chevron \{[^}]*transition: none;/)
  })
})
