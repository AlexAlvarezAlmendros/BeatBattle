import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { t } from '../../i18n'
import { EntryRow } from './EntryRow'
import entryRowCss from './EntryRow.module.css?raw'

const renderRow = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)
const css = entryRowCss.replace(/\/\*[\s\S]*?\*\//g, '')

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
    expect(row.querySelector('[data-entry-result]')).toHaveTextContent('1.º')
  })

  it('RD-VIS-05 / WCAG 1.4.10 y 1.4.12: título y subtítulo parten en líneas (sin «…») y en la fila estrecha el resultado baja a una segunda fila', () => {
    expect(css).not.toMatch(/text-overflow:\s*ellipsis/)
    expect(css).not.toMatch(/white-space:\s*nowrap/)
    expect(css).toMatch(/\.title \{[^}]*overflow-wrap: anywhere/)
    expect(css).toMatch(/\.subtitle \{[^}]*overflow-wrap: anywhere/)
    // La fila es el contenedor y su cuerpo, la rejilla: estrecha, el resultado va bajo el título.
    expect(css).toMatch(/\.row \{[^}]*container: entry-row \/ inline-size/)
    expect(css).toMatch(
      /@container entry-row \(width < \d+(\.\d+)?rem\) \{\s*\.body \{[^}]*"cover info info"\s*"\. result actions"/,
    )
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
