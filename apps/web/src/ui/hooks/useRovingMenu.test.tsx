import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { type RovingMenuOptions, useRovingMenu } from './useRovingMenu'

const MODES = ['Jugar', 'Jurado', 'Resultados', 'Salón de la fama', 'Cómo se juega', 'Ajustes']

function Menu(props: Partial<RovingMenuOptions> & { links?: boolean }) {
  const { links = false, ...options } = props
  const menu = useRovingMenu({ count: MODES.length, ...options })
  return (
    <>
      <button type="button">Antes</button>
      <ul {...menu.getContainerProps({ 'aria-label': 'Elige modo' })}>
        {MODES.map((mode, index) => (
          <li key={mode} role="none">
            {links ? (
              <a href={`#${index}`} {...menu.getItemProps<HTMLAnchorElement>(index)}>
                {mode}
              </a>
            ) : (
              <div {...menu.getItemProps<HTMLDivElement>(index)}>{mode}</div>
            )}
          </li>
        ))}
      </ul>
      <input aria-label="Campo" />
    </>
  )
}

const items = () => screen.getAllByRole('menuitem')

describe('useRovingMenu (§3.3, §3.8.3, RD-MOT-05)', () => {
  it('RD-MOT-05: role="menu" con menuitems y una sola parada de tabulación', async () => {
    const user = userEvent.setup()
    render(<Menu />)
    expect(screen.getByRole('menu', { name: 'Elige modo' })).toHaveAttribute('aria-orientation', 'vertical')
    expect(items()).toHaveLength(6)
    expect(items().filter((item) => item.tabIndex === 0)).toEqual([items()[0]])
    await user.click(screen.getByRole('button', { name: 'Antes' }))
    await user.tab()
    expect(items()[0]).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('textbox', { name: 'Campo' })).toHaveFocus()
  })

  it('RD-MOT-05: ↑/↓ mueven el foco en bucle, Inicio/Fin; el foco es la selección (data-cursor-active)', async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    render(<Menu onMove={onMove} />)
    items()[0]!.focus()
    await user.keyboard('{ArrowDown}')
    expect(items()[1]).toHaveFocus()
    expect(items()[1]).toHaveAttribute('data-cursor-active', 'true')
    expect(items()[1]).toHaveAttribute('tabindex', '0')
    expect(items()[0]).toHaveAttribute('tabindex', '-1')
    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(items()[5]).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(items()[0]).toHaveFocus()
    await user.keyboard('{End}')
    expect(items()[5]).toHaveFocus()
    await user.keyboard('{Home}')
    expect(items()[0]).toHaveFocus()
    expect(onMove.mock.calls.map(([index]) => index)).toEqual([1, 0, 5, 0, 5, 0])
  })

  it('RD-MOT-05: la letra inicial salta a la siguiente opción que empieza por ella (sin acentos)', async () => {
    const user = userEvent.setup()
    render(<Menu />)
    items()[0]!.focus()
    await user.keyboard('j')
    expect(items()[1]).toHaveFocus()
    await user.keyboard('s')
    expect(items()[3]).toHaveFocus()
    await user.keyboard('c')
    expect(items()[4]).toHaveFocus()
  })

  it('una letra sin opción sigue su camino (la tecla M del sonido llega al documento)', async () => {
    const user = userEvent.setup()
    const seen = vi.fn()
    document.addEventListener('keydown', seen)
    render(<Menu />)
    items()[0]!.focus()
    await user.keyboard('m')
    expect(items()[0]).toHaveFocus()
    expect(seen.mock.calls.at(-1)?.[0].defaultPrevented).toBe(false)
    document.removeEventListener('keydown', seen)
  })

  it('RD-MOT-05: Intro y espacio activan una vez; el clic también', async () => {
    const user = userEvent.setup()
    const onActivate = vi.fn()
    render(<Menu onActivate={onActivate} />)
    items()[0]!.focus()
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onActivate).toHaveBeenLastCalledWith(1)
    await user.keyboard(' ')
    expect(onActivate).toHaveBeenCalledTimes(2)
    await user.click(items()[4]!)
    expect(onActivate).toHaveBeenLastCalledWith(4)
    expect(items()[4]).toHaveAttribute('data-cursor-active', 'true')
    expect(onActivate).toHaveBeenCalledTimes(3)
  })

  it('con enlaces, Intro lo deja al navegador (un solo clic, una sola activación)', async () => {
    const user = userEvent.setup()
    const onActivate = vi.fn()
    render(<Menu links onActivate={onActivate} />)
    items()[0]!.focus()
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onActivate).toHaveBeenCalledTimes(1)
    expect(onActivate).toHaveBeenLastCalledWith(1)
  })

  it('el ratón mueve el cursor al pasar por encima (y el foco, si estaba en el menú)', async () => {
    const user = userEvent.setup()
    render(<Menu />)
    items()[0]!.focus()
    await user.hover(items()[3]!)
    expect(items()[3]).toHaveFocus()
    expect(items()[3]).toHaveAttribute('data-cursor-active', 'true')
  })

  it('pasar el ratón no le roba el foco a un campo de texto', async () => {
    const user = userEvent.setup()
    render(<Menu />)
    const field = screen.getByRole('textbox', { name: 'Campo' })
    await user.click(field)
    await user.hover(items()[2]!)
    expect(field).toHaveFocus()
    expect(items()[2]).toHaveAttribute('data-cursor-active', 'true')
  })

  it('§3.8.3: el cursor empieza en la primera opción habilitada; la deshabilitada se recorre pero no entra', async () => {
    const user = userEvent.setup()
    const onActivate = vi.fn()
    render(<Menu autoFocus isDisabled={(index) => index === 0} onActivate={onActivate} />)
    expect(items()[1]).toHaveFocus()
    expect(items()[0]).toHaveAttribute('aria-disabled', 'true')
    await user.keyboard('{ArrowUp}{Enter}')
    expect(items()[0]).toHaveFocus()
    expect(onActivate).not.toHaveBeenCalled()
  })
})
