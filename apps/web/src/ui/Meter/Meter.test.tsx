import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Meter } from './Meter'

describe('Meter (§3.3 «Medidor», 0.25)', () => {
  it('es un meter con su valor en palabras y a la vista', () => {
    render(
      <Meter
        value={2980}
        min={2650}
        max={3350}
        label="Experiencia"
        valueText="2.980 de 3.350 XP para el nivel 8"
        caption={{ start: 'XP 2.980', end: 'NV 8 · 3.350' }}
      />,
    )
    const meter = screen.getByRole('meter', { name: 'Experiencia' })
    expect(meter).toHaveAttribute('aria-valuenow', '2980')
    expect(meter).toHaveAttribute('aria-valuetext', '2.980 de 3.350 XP para el nivel 8')
    expect(screen.getByText('XP 2.980')).toBeInTheDocument()
  })

  it('lleno es su estado de éxito; como barra de progreso, con su rol', () => {
    const { container } = render(
      <Meter value={45} max={45} label="Escucha" valueText="45 de 45 s" role="progressbar" />,
    )
    expect(screen.getByRole('progressbar', { name: 'Escucha' })).toBeInTheDocument()
    expect(container.firstElementChild).toHaveAttribute('data-full', 'true')
  })
})
