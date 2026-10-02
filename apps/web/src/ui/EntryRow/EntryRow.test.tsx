import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../i18n'
import type { WaveformPeak } from '../Waveform'
import { EntryList, EntryRow } from './EntryRow'
import rowCss from './EntryRow.module.css?raw'

const PEAKS: WaveformPeak[] = Array.from({ length: 40 }, (_, i) => [-((i % 7) / 7), (i % 5) / 5])

afterEach(() => {
  document.documentElement.removeAttribute('data-motion')
})

function renderRow(props: Partial<Parameters<typeof EntryRow>[0]> = {}) {
  return render(
    <MemoryRouter>
      <EntryList aria-label="Entradas">
        <EntryRow
          title="Tigre púrpura"
          alias="lilbru"
          genres={['Drill', 'Trap']}
          bpm={142}
          musicalKey="Fa menor"
          peaks={PEAKS}
          to="/e/0192f3a1"
          {...props}
        />
      </EntryList>
    </MemoryRouter>,
  )
}

describe('EntryRow', () => {
  it('es un artículo con nombre (su título) dentro de una lista', () => {
    renderRow()
    const list = screen.getByRole('list', { name: 'Entradas' })
    const row = within(list).getByRole('article', { name: 'Tigre púrpura' })
    expect(within(row).getByRole('heading', { level: 3, name: 'Tigre púrpura' })).toBeInTheDocument()
    expect(within(row).getByRole('link', { name: 'Tigre púrpura' })).toHaveAttribute('href', '/e/0192f3a1')
  })

  it('anatomía del sello: «Prod. by», chips de género, BPM y tonalidad', () => {
    renderRow()
    expect(screen.getByText(t('ui.entryRow.by', { alias: 'lilbru' }))).toBeInTheDocument()
    const genres = screen.getByRole('list', { name: t('ui.entryRow.genres') })
    expect(
      within(genres)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Drill', 'Trap'])
    expect(screen.getByText(t('ui.entryRow.bpm', { bpm: 142 }))).toBeInTheDocument()
    expect(screen.getByText('Fa menor')).toBeInTheDocument()
  })

  it('RNF-A11Y-01: el play se alcanza con teclado y su nombre dice qué suena', async () => {
    const user = userEvent.setup()
    const onPlayToggle = vi.fn()
    const { rerender } = renderRow({ onPlayToggle })
    await user.tab()
    const play = screen.getByRole('button', { name: t('ui.entryRow.play', { title: 'Tigre púrpura' }) })
    expect(play).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onPlayToggle).toHaveBeenCalledTimes(1)
    rerender(
      <MemoryRouter>
        <EntryRow title="Tigre púrpura" alias="lilbru" peaks={PEAKS} playing progress={0.4} />
      </MemoryRouter>,
    )
    expect(
      screen.getByRole('button', { name: t('ui.entryRow.pause', { title: 'Tigre púrpura' }) }),
    ).toBeInTheDocument()
    expect(screen.getByRole('article')).toHaveAttribute('data-playing', 'true')
  })

  it('RNF-A11Y-01: el título no recorta el anillo de foco de su enlace (la elipsis va en el texto)', () => {
    const rule = (selector: string) => new RegExp(`\\${selector} \\{([^}]*)\\}`).exec(rowCss)?.[1] ?? ''
    expect(rule('.title')).not.toMatch(/overflow/)
    expect(rule('.titleText')).toMatch(/overflow: hidden/)
    expect(rule('.titleText')).toMatch(/text-overflow: ellipsis/)
    renderRow({ state: 'focusTitle' })
    const link = screen.getByRole('link', { name: 'Tigre púrpura' })
    // Foco forzado para la galería: en el enlace del título (no en el play) y la fila con su fondo.
    expect(link).toHaveAttribute('data-force-state', 'focus')
    expect(screen.getByRole('button', { name: /Tigre púrpura/ })).not.toHaveAttribute('data-force-state')
    expect(screen.getByRole('article')).toHaveAttribute('data-force-state', 'focus')
  })

  it('RNF-A11Y-09: con puntero grueso el enlace del título se estira a toda la fila y el play queda encima', () => {
    // jsdom no evalúa @media: se comprueba la regla (en Chrome, a 390 px táctil, un toque en el hueco
    // de la fila abre la ficha y el play sigue siendo el play).
    const coarse = /@media \(hover: none\), \(pointer: coarse\) \{([\s\S]*?)\n\}/.exec(rowCss)?.[1] ?? ''
    expect(coarse).toMatch(/\.titleLink::after \{[^}]*position: absolute;[^}]*inset: 0;/)
    expect(coarse).toMatch(/\.row \{[^}]*position: relative;/)
    expect(coarse).toMatch(/\.play,\s*\.actions \{[^}]*z-index: 1;/)
  })

  it('RD-VIS-02: en móvil la portada se queda en 48 px, como en el sello', () => {
    expect(rowCss).toMatch(/\.thumb \{[^}]*width: var\(--bb-space-12\);[^}]*height: var\(--bb-space-12\);/)
    // Ninguna media query vuelve a tocar la portada.
    const queries = rowCss.split('@media').slice(1)
    for (const query of queries) expect(query).not.toMatch(/\.thumb \{/)
  })

  it('la mini onda es decorativa y la portada sin imagen también', () => {
    const { container } = renderRow({ progress: 0.3 })
    expect(screen.queryByRole('img')).toBeNull()
    expect(container.querySelector('[data-progress="30"]')).toHaveAttribute('aria-hidden', 'true')
  })

  it('con portada, la imagen tiene texto alternativo', () => {
    renderRow({ coverUrl: '/portada.jpg' })
    expect(
      screen.getByRole('img', { name: t('ui.entryRow.cover', { title: 'Tigre púrpura' }) }),
    ).toBeInTheDocument()
  })

  it('RD-VIS-03 / RD-MOT-03: hover forzado; la mini onda respira y sin movimiento se queda quieta', () => {
    const { container } = renderRow({ state: 'hover' })
    const row = screen.getByRole('article')
    expect(row).toHaveAttribute('data-force-state', 'hover')
    const wave = container.querySelector('[data-progress]')!.parentElement!
    expect(getComputedStyle(wave).getPropertyValue('animation')).toMatch(/breathe/)
    document.documentElement.setAttribute('data-motion', 'reduced')
    expect(getComputedStyle(wave).getPropertyValue('animation')).toBe('none')
  })
})
