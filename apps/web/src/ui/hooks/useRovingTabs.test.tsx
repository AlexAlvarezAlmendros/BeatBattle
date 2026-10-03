import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useRovingTabs } from './useRovingTabs'

const ORDERS = ['Ronda justa', 'Recién subidas', 'Aleatorio']

function Tabs({ onChange, globalKeys }: { onChange?: (index: number) => void; globalKeys?: boolean }) {
  const tabs = useRovingTabs({ count: ORDERS.length, onChange, globalKeys })
  return (
    <>
      <div {...tabs.getTabListProps({ 'aria-label': 'Orden' })}>
        {ORDERS.map((order, index) => (
          <button key={order} type="button" {...tabs.getTabProps<HTMLButtonElement>(index)}>
            {order}
          </button>
        ))}
      </div>
      {ORDERS.map((order, index) => (
        <div key={order} {...tabs.getPanelProps(index)}>
          {`Panel ${order}`}
        </div>
      ))}
      <button type="button">Rejilla</button>
      <input aria-label="Buscar" />
    </>
  )
}

const tabs = () => screen.getAllByRole('tab')

describe('useRovingTabs (§3.3 «Pestañas», §3.8.13, RD-MOT-05)', () => {
  it('RD-MOT-05: tablist con pestañas y paneles enlazados; una sola parada de tabulación', () => {
    render(<Tabs />)
    expect(screen.getByRole('tablist', { name: 'Orden' })).toBeInTheDocument()
    expect(tabs()[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabs().filter((tab) => tab.tabIndex === 0)).toEqual([tabs()[0]])
    const panel = screen.getByRole('tabpanel')
    expect(panel).toHaveTextContent('Panel Ronda justa')
    expect(panel).toHaveAttribute('aria-labelledby', tabs()[0]!.id)
    expect(tabs()[0]).toHaveAttribute('aria-controls', panel.id)
  })

  it('RD-MOT-05: ←/→ eligen en bucle y llevan el foco; Inicio/Fin', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Tabs onChange={onChange} />)
    tabs()[0]!.focus()
    await user.keyboard('{ArrowLeft}')
    expect(tabs()[2]).toHaveFocus()
    expect(tabs()[2]).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel Aleatorio')
    await user.keyboard('{ArrowRight}')
    expect(tabs()[0]).toHaveFocus()
    await user.keyboard('{End}')
    expect(tabs()[2]).toHaveFocus()
    expect(onChange.mock.calls.map(([index]) => index)).toEqual([2, 0, 2])
  })

  it('RD-MOT-05: Q y E eligen desde cualquier sitio sin robar el foco (la rejilla sigue enfocada)', async () => {
    const user = userEvent.setup()
    render(<Tabs />)
    const grid = screen.getByRole('button', { name: 'Rejilla' })
    grid.focus()
    await user.keyboard('e')
    expect(tabs()[1]).toHaveAttribute('aria-selected', 'true')
    expect(grid).toHaveFocus()
    await user.keyboard('q')
    await user.keyboard('q')
    expect(tabs()[2]).toHaveAttribute('aria-selected', 'true')
    expect(grid).toHaveFocus()
  })

  it('Q/E llevan el foco si ya estaba en las pestañas; no actúan al escribir ni con modificadores', async () => {
    const user = userEvent.setup()
    render(<Tabs />)
    tabs()[0]!.focus()
    await user.keyboard('E')
    expect(tabs()[1]).toHaveFocus()
    await user.click(screen.getByRole('textbox', { name: 'Buscar' }))
    await user.keyboard('qe')
    expect(tabs()[1]).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{Control>}e{/Control}')
    expect(tabs()[1]).toHaveAttribute('aria-selected', 'true')
  })

  it('sin teclas globales, Q/E no hacen nada', async () => {
    const user = userEvent.setup()
    render(<Tabs globalKeys={false} />)
    screen.getByRole('button', { name: 'Rejilla' }).focus()
    await user.keyboard('e')
    expect(tabs()[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('clic en una pestaña la elige; controlada, sigue al valor de fuera', async () => {
    const user = userEvent.setup()
    function Controlled() {
      const [selected, setSelected] = useState(1)
      const t = useRovingTabs({ count: 3, selectedIndex: selected, onChange: setSelected, globalKeys: false })
      return (
        <div {...t.getTabListProps({ 'aria-label': 'Controladas' })}>
          {ORDERS.map((order, index) => (
            <button key={order} type="button" {...t.getTabProps<HTMLButtonElement>(index)}>
              {order}
            </button>
          ))}
        </div>
      )
    }
    render(<Controlled />)
    expect(tabs()[1]).toHaveAttribute('aria-selected', 'true')
    expect(tabs()[1]).toHaveAttribute('tabindex', '0')
    await user.click(tabs()[2]!)
    expect(tabs()[2]).toHaveAttribute('aria-selected', 'true')
    expect(tabs()[2]).toHaveAttribute('tabindex', '0')
  })
})
