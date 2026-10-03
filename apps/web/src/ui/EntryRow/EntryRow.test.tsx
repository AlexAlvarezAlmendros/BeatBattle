import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { t } from '../../i18n'
import { EntryRow } from './EntryRow'

const renderRow = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('EntryRow (§3.3 «Fila de entrada», 0.25)', () => {
  it('RF-PLAY-05: antes del sellado, sin posición ni puntuación ni medalla', () => {
    renderRow(<EntryRow title="Lluvia en Gràcia" subtitle="S41 · en juego" to="/e/1" />)
    const row = screen.getByRole('article', { name: 'Lluvia en Gràcia' })
    expect(row).not.toHaveAttribute('data-sealed')
    expect(row.textContent).not.toMatch(/\d\.º|\d,\d\d/)
    expect(screen.queryByRole('img', { name: /Disco/ })).toBeNull()
  })

  it('tras el sellado: posición en display, puntuación y la medalla con su nombre', () => {
    renderRow(<EntryRow title="Neón en Sants" result={{ position: 1, score: 4.62, medal: 1 }} />)
    const row = screen.getByRole('article', { name: 'Neón en Sants' })
    expect(row).toHaveTextContent('1.º')
    expect(row).toHaveTextContent('4,62')
    expect(screen.getByRole('img', { name: t('ui.medal.place1') })).toBeInTheDocument()
  })

  it('RF-PLAY-09: con error de audio avisa y el play pasa a «Reintentar»', async () => {
    const user = userEvent.setup()
    const onPlayToggle = vi.fn()
    renderRow(<EntryRow title="Neón en Sants" status="error" onPlayToggle={onPlayToggle} />)
    expect(screen.getByText(t('ui.entryRow.loadError'))).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: t('ui.entryRow.retry', { title: 'Neón en Sants' }) }))
    expect(onPlayToggle).toHaveBeenCalled()
  })

  it('cargando y deshabilitada: el play lo dice y no responde', async () => {
    const user = userEvent.setup()
    const onPlayToggle = vi.fn()
    renderRow(<EntryRow title="Neón en Sants" disabled onPlayToggle={onPlayToggle} />)
    const play = screen.getByRole('button', { name: t('ui.entryRow.play', { title: 'Neón en Sants' }) })
    expect(play).toHaveAttribute('aria-disabled', 'true')
    await user.click(play)
    expect(onPlayToggle).not.toHaveBeenCalled()
  })
})
