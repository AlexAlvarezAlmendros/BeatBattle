import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { useRovingGrid } from './useRovingGrid'

const ENTRIES = Array.from({ length: 23 }, (_, index) => `Entrada ${String.fromCharCode(65 + index)}`)

function Grid({
  onActivate,
  onMove,
}: {
  onActivate?: (index: number) => void
  onMove?: (index: number) => void
}) {
  const grid = useRovingGrid({ count: ENTRIES.length, columns: 6, onActivate, onMove })
  return (
    <div {...grid.getContainerProps({ 'aria-label': 'Entradas' })}>
      {ENTRIES.map((entry, index) => (
        <div key={entry} {...grid.getItemProps<HTMLDivElement>(index)}>
          {entry}
        </div>
      ))}
    </div>
  )
}

const options = () => screen.getAllByRole('option')

describe('useRovingGrid (§3.8.13, RD-MOT-05)', () => {
  it('RD-MOT-05: listbox con opciones, una sola parada de tabulación y aria-selected en la elegida', () => {
    render(<Grid />)
    expect(screen.getByRole('listbox', { name: 'Entradas' })).toBeInTheDocument()
    expect(options()).toHaveLength(23)
    expect(options().filter((option) => option.tabIndex === 0)).toHaveLength(1)
    expect(options()[0]).toHaveAttribute('aria-selected', 'true')
    expect(options()[1]).toHaveAttribute('aria-selected', 'false')
  })

  it('RD-MOT-05: ←→↑↓ en bucle, conservando la columna; el foco es la selección', async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    render(<Grid onMove={onMove} />)
    options()[0]!.focus()
    await user.keyboard('{ArrowLeft}')
    expect(options()[22]).toHaveFocus()
    expect(options()[22]).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}')
    expect(options()[2]).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(options()[8]).toHaveFocus()
    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(options()[20]).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(options()[2]).toHaveFocus()
    expect(onMove).toHaveBeenLastCalledWith(2)
  })

  it('RD-MOT-05: Inicio, Fin, RePág y AvPág', async () => {
    const user = userEvent.setup()
    render(<Grid />)
    options()[0]!.focus()
    await user.keyboard('{End}')
    expect(options()[22]).toHaveFocus()
    await user.keyboard('{Home}')
    expect(options()[0]).toHaveFocus()
    await user.keyboard('{PageDown}')
    expect(options()[18]).toHaveFocus()
    await user.keyboard('{PageUp}')
    expect(options()[0]).toHaveFocus()
  })

  it('Intro, espacio y clic activan la casilla (una vez)', async () => {
    const user = userEvent.setup()
    const onActivate = vi.fn()
    render(<Grid onActivate={onActivate} />)
    options()[0]!.focus()
    await user.keyboard('{ArrowRight}{Enter}')
    expect(onActivate).toHaveBeenLastCalledWith(1)
    await user.keyboard(' ')
    await user.click(options()[7]!)
    expect(onActivate.mock.calls.map(([index]) => index)).toEqual([1, 1, 7])
    expect(options()[7]).toHaveAttribute('aria-selected', 'true')
  })
})
