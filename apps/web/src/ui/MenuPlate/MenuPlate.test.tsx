import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'
import { useRovingMenu } from '../hooks/useRovingMenu'
import { MenuPlate } from './MenuPlate'

const MODES = [
  { label: 'Jugar', to: '/subir', disabled: true, detail: 'Disponible el lunes' },
  { label: 'Jurado', to: '/jurado', detail: '16 sin votar' },
  { label: 'Ajustes', to: '/ajustes' },
] as const

function Menu() {
  const menu = useRovingMenu({
    count: MODES.length,
    isDisabled: (index) => 'disabled' in (MODES[index] ?? {}),
  })
  return (
    <ul {...menu.getContainerProps({ 'aria-label': 'Elige modo' })}>
      {MODES.map((mode, index) => (
        <li key={mode.label} role="none">
          <MenuPlate
            index={index + 1}
            label={mode.label}
            detail={'detail' in mode ? mode.detail : undefined}
            disabled={'disabled' in mode}
            to={mode.to}
            itemProps={menu.getItemProps(index)}
          />
        </li>
      ))}
    </ul>
  )
}

function renderMenu() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Menu />} />
        <Route path="*" element={<h1>Destino</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('MenuPlate (§3.3 «Opción de menú», 0.25)', () => {
  it('RD-MOT-05: menú con una parada de tabulación; la elegida al entrar es la primera disponible', () => {
    renderMenu()
    const items = within(screen.getByRole('menu', { name: 'Elige modo' })).getAllByRole('menuitem')
    expect(items).toHaveLength(3)
    expect(items.filter((item) => item.tabIndex === 0)).toEqual([items[1]])
    expect(items[1]).toHaveAttribute('data-cursor-active', 'true')
    // El índice es decorativo: el nombre es la etiqueta y su dato.
    expect(items[1]).toHaveAccessibleName('Jurado 16 sin votar')
  })

  it('§3.3: la deshabilitada lleva candado, aria-disabled y su motivo, y no entra', async () => {
    const user = userEvent.setup()
    renderMenu()
    const play = screen.getByRole('menuitem', { name: /Jugar/ })
    expect(play).toHaveAttribute('aria-disabled', 'true')
    expect(play.querySelector('[data-icon="lock"]')).not.toBeNull()
    expect(play).toHaveTextContent('Disponible el lunes')
    await user.click(play)
    expect(screen.queryByRole('heading', { name: 'Destino' })).toBeNull()
  })

  it('↑/↓ mueven el cursor en bucle (también por la deshabilitada) e Intro entra', async () => {
    const user = userEvent.setup()
    renderMenu()
    const items = screen.getAllByRole('menuitem')
    items[1]!.focus()
    await user.keyboard('{ArrowDown}')
    expect(items[2]).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(items[0]).toHaveFocus()
    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(items[1]).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('heading', { name: 'Destino' })).toBeInTheDocument()
  })

  it('la elegida enseña su tecla de entrar y el cursor con 1P', () => {
    renderMenu()
    const jury = screen.getByRole('menuitem', { name: /Jurado/ })
    expect(jury.querySelector('kbd[data-key="light"]')).not.toBeNull()
    expect(jury.querySelector('[data-cursor-ring="slant"]')).not.toBeNull()
    expect(jury.querySelector('[data-cursor-player="left"]')).toHaveTextContent('1P')
  })
})
