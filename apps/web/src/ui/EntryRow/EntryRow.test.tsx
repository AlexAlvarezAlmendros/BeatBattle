import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../i18n'
import type { WaveformPeak } from '../Waveform'
import { EntryList, EntryRow } from './EntryRow'

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
