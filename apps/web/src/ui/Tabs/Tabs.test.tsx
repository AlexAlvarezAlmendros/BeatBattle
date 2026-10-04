import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Tabs } from './Tabs'

const TABS = [
  { id: 'fair', label: 'Ronda justa', panel: <p>Primero, las que menos votos llevan.</p> },
  { id: 'recent', label: 'Recién subidas', panel: <p>Las últimas, primero.</p> },
  { id: 'sealed', label: 'Selladas', panel: <p>Tras el sellado.</p>, disabled: true },
  { id: 'random', label: 'Aleatorio', panel: <p>Un orden nuevo.</p> },
]

describe('Tabs (§3.3 «Pestañas», 0.25)', () => {
  it('RD-MOT-05: tablist con una parada; ←/→ eligen (la selección sigue al cursor)', async () => {
    const user = userEvent.setup()
    render(<Tabs label="Orden" tabs={TABS} />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.filter((tab) => tab.tabIndex === 0)).toEqual([tabs[0]])
    tabs[0]!.focus()
    await user.keyboard('{ArrowRight}')
    expect(tabs[1]).toHaveFocus()
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Las últimas, primero.')
  })

  it('§3.3: la deshabilitada lleva aria-disabled, el cursor pasa por ella y Q/E la saltan', async () => {
    const user = userEvent.setup()
    render(<Tabs label="Orden" tabs={TABS} defaultIndex={1} />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs[2]).toHaveAttribute('aria-disabled', 'true')
    await user.keyboard('e')
    expect(tabs[3]).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('q')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
    await user.click(tabs[2]!)
    expect(tabs[2]).toHaveAttribute('aria-selected', 'false')
  })

  it('enseña las teclas Q y E a los lados, ocultas a los lectores', () => {
    const { container } = render(<Tabs label="Orden" tabs={TABS} globalKeys={false} />)
    const keys = [...container.querySelectorAll('kbd[data-key]')]
    expect(keys.map((key) => key.textContent)).toEqual(['Q', 'E'])
    for (const key of keys) expect(key).toHaveAttribute('aria-hidden', 'true')
  })
})
