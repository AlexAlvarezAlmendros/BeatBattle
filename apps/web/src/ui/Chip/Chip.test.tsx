import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { CHIP_ORIGIN_X_VAR, CHIP_ORIGIN_Y_VAR, Chip, ChipGroup } from './Chip'
import chipCss from './Chip.module.css?raw'

function Toggle() {
  const [on, setOn] = useState(false)
  return (
    <Chip selected={on} onSelectedChange={setOn}>
      Trap
    </Chip>
  )
}

describe('Chip', () => {
  it('es un botón conmutable con aria-pressed', async () => {
    const user = userEvent.setup()
    render(<Toggle />)
    const chip = screen.getByRole('button', { name: 'Trap' })
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    await user.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    expect(chip).toHaveAttribute('data-selected', 'true')
    await user.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'false')
  })

  it('RNF-A11Y-01: se enfoca y conmuta con Espacio e Intro', async () => {
    const user = userEvent.setup()
    render(<Toggle />)
    await user.tab()
    const chip = screen.getByRole('button', { name: 'Trap' })
    expect(chip).toHaveFocus()
    await user.keyboard(' ')
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    await user.keyboard('{Enter}')
    expect(chip).toHaveAttribute('aria-pressed', 'false')
  })

  it('el relleno crece desde el punto del clic (Anexo E)', () => {
    render(<Chip>Drill</Chip>)
    const chip = screen.getByRole('button', { name: 'Drill' })
    chip.getBoundingClientRect = () => ({ left: 10, top: 20, width: 60, height: 28 }) as DOMRect
    fireEvent.pointerDown(chip, { clientX: 25, clientY: 30 })
    expect(chip.style.getPropertyValue(CHIP_ORIGIN_X_VAR)).toBe('15px')
    expect(chip.style.getPropertyValue(CHIP_ORIGIN_Y_VAR)).toBe('10px')
  })

  it('deshabilitado no conmuta; los estados forzados salen en data-force-state', async () => {
    const user = userEvent.setup()
    const onSelectedChange = vi.fn()
    render(
      <>
        <Chip disabled onSelectedChange={onSelectedChange}>
          Jerk
        </Chip>
        <Chip state="hover">Club</Chip>
      </>,
    )
    await user.click(screen.getByRole('button', { name: 'Jerk' }))
    expect(onSelectedChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Club' })).toHaveAttribute('data-force-state', 'hover')
  })

  it('ChipGroup: grupo con nombre que agrupa los chips', () => {
    render(
      <ChipGroup label="Géneros">
        <Chip>Drill</Chip>
        <Chip>Trap</Chip>
      </ChipGroup>,
    )
    const group = screen.getByRole('group', { name: 'Géneros' })
    expect(group.querySelectorAll('button')).toHaveLength(2)
  })

  it('RNF-A11Y-09: en táctil, ChipGroup separa las filas con el token del hueco (44 px − alto del chip)', () => {
    // jsdom no evalúa media queries: se comprueba la regla tal cual está en la hoja.
    const coarse = /@media \(pointer: coarse\) \{\s*\.group \{\s*row-gap: var\(--bb-chip-row-gap-touch\);/
    expect(chipCss).toMatch(coarse)
  })
})
