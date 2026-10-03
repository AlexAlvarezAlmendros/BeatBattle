import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { DataChip } from './DataChip'
import { FilterChip } from './FilterChip'

describe('chips (§3.3, 0.25)', () => {
  it('el chip de dato no es interactivo: valor y unidad, con chaflán --bb-cut-sm', () => {
    const { container } = render(<DataChip value="92" unit="BPM" />)
    const chip = container.firstElementChild!
    expect(chip).toHaveTextContent('92BPM')
    expect(chip).toHaveAttribute('data-frame-cut', 'sm')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('el chip de filtro es un conmutador con aria-pressed y su estado en texto (SÍ/NO)', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [on, setOn] = useState(false)
      return <FilterChip label="Solo sin votar" pressed={on} onChange={setOn} />
    }
    render(<Harness />)
    const chip = screen.getByRole('button', { name: 'Solo sin votar' })
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    expect(chip.querySelector('[data-on]')).toHaveTextContent('No')
    await user.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    expect(chip.querySelector('[data-on]')).toHaveTextContent('Sí')
    chip.focus()
    await user.keyboard(' ')
    expect(chip).toHaveAttribute('aria-pressed', 'false')
  })
})
