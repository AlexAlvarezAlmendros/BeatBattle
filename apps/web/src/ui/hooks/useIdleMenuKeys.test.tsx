import { fireEvent, render, screen } from '@testing-library/react'
import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useIdleMenuKeys } from './useIdleMenuKeys'
import { useRovingMenu } from './useRovingMenu'

const MODES = ['Jugar', 'Jurado', 'Resultados']

/**
 * Pantalla de prueba: un menú con el teclado de recreativa, el `<main>` del marco (destino de foco) y,
 * si se pide, una ventana de juego abierta encima (como la que pinta `Modal`).
 */
function Screen({ onActivate, dialog = false }: { onActivate: (index: number) => void; dialog?: boolean }) {
  const listRef = useRef<HTMLUListElement>(null)
  const menu = useRovingMenu({ count: MODES.length, onActivate })
  useIdleMenuKeys(menu, MODES.length, listRef)
  const [open] = useState(dialog)
  return (
    <main tabIndex={-1} data-focus-target="main" aria-label="Contenido">
      <ul ref={listRef} {...menu.getContainerProps({ 'aria-label': 'Elige modo' })}>
        {MODES.map((mode, index) => (
          <li key={mode} role="none">
            <button type="button" {...menu.getItemProps<HTMLButtonElement>(index)}>
              {mode}
            </button>
          </li>
        ))}
      </ul>
      {open && (
        <div role="dialog" aria-modal="true" aria-label="Ventana" tabIndex={-1} data-focus-target="dialog">
          <button type="button">Cerrar</button>
        </div>
      )}
    </main>
  )
}

const items = () => screen.getAllByRole('menuitem')
const press = (key: string) => fireEvent.keyDown(document.activeElement ?? document.body, { key })

describe('useIdleMenuKeys (§3.8.3: con el foco en ningún control, las flechas e Intro van al menú)', () => {
  it('RD-VIS-02 d: con el foco en el <main> del marco, ↓ mueve el cursor e Intro entra', () => {
    const onActivate = vi.fn()
    render(<Screen onActivate={onActivate} />)
    screen.getByRole('main').focus()
    press('ArrowDown')
    expect(items()[1]).toHaveFocus()
    screen.getByRole('main').focus()
    press('Enter')
    expect(onActivate).toHaveBeenCalledWith(1)
  })

  it('RNF-A11Y-01: con una ventana de juego abierta (foco en el diálogo), Intro y las flechas no tocan el menú de detrás', () => {
    const onActivate = vi.fn()
    render(<Screen onActivate={onActivate} dialog />)
    const dialog = screen.getByRole('dialog', { name: 'Ventana' })
    dialog.focus()
    press('ArrowDown')
    press('End')
    press('Enter')
    expect(dialog).toHaveFocus()
    expect(onActivate).not.toHaveBeenCalled()
    expect(items()[0]).toHaveAttribute('data-cursor-active', 'true')
  })

  it('RD-VIS-02 d: sin ninguna opción en la lista, deja pasar la tecla para que la recoja otro menú (§3.8.14)', () => {
    function Empty() {
      const listRef = useRef<HTMLDivElement>(null)
      useIdleMenuKeys({ activeIndex: 0, moveTo: () => {} }, 1, listRef, { itemSelector: '[data-idle-start]' })
      return <div ref={listRef} />
    }
    render(<Empty />)
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
    document.body.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })

  it('RD-VIS-02 d: con su selector y su forma de activar, Intro acciona el primer elemento de juego (§3.8.14)', () => {
    const activate = vi.fn()
    const moveTo = vi.fn()
    function Start() {
      const listRef = useRef<HTMLDivElement>(null)
      useIdleMenuKeys({ activeIndex: 0, moveTo }, 1, listRef, { itemSelector: '[data-idle-start]', activate })
      return (
        <div ref={listRef}>
          <a href="/" data-idle-start="">
            Volver al menú
          </a>
        </div>
      )
    }
    render(<Start />)
    press('ArrowDown')
    expect(moveTo).toHaveBeenCalledWith(0)
    press('Enter')
    expect(activate).toHaveBeenCalledWith(screen.getByRole('link', { name: 'Volver al menú' }))
  })

  it('RD-VIS-02 d: Intro mantenida entra una sola vez (las repeticiones de la tecla no cuentan)', () => {
    const onActivate = vi.fn()
    render(<Screen onActivate={onActivate} />)
    screen.getByRole('main').focus()
    fireEvent.keyDown(screen.getByRole('main'), { key: 'Enter', repeat: true })
    expect(onActivate).not.toHaveBeenCalled()
    fireEvent.keyDown(screen.getByRole('main'), { key: 'Enter' })
    expect(onActivate).toHaveBeenCalledTimes(1)
  })

  it('RNF-A11Y-01: con una ventana abierta, tampoco cuenta como reposo el foco en <body>', () => {
    const onActivate = vi.fn()
    render(<Screen onActivate={onActivate} dialog />)
    ;(document.activeElement as HTMLElement | null)?.blur()
    press('ArrowDown')
    press('Enter')
    expect(onActivate).not.toHaveBeenCalled()
    expect(items()[0]).toHaveAttribute('data-cursor-active', 'true')
  })
})
