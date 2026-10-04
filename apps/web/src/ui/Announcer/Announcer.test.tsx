import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Announcer } from './Announcer'

describe('Announcer (§3.3, §3.9; 0.25)', () => {
  it('el rótulo es espectáculo (data-fx, oculto a lectores) y se repite en una región viva educada', () => {
    const { container } = render(<Announcer text="¡Voto guardado!" />)
    expect(container.querySelector('[data-fx]')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('¡Voto guardado!')
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
  })

  it('RD-VIS-02 e: la etiqueta girada lleva el tono de su evento (03-jurado: «¡A escuchar!» blanca, «¡Voto guardado!» roja)', () => {
    const { container, rerender } = render(<Announcer text="¡A escuchar!" variant="tag" silent />)
    expect(container.querySelector('[data-tag]')).toHaveAttribute('data-tag', 'white')
    rerender(<Announcer text="¡Voto guardado!" variant="tag" tone="red" silent />)
    expect(container.querySelector('[data-tag]')).toHaveAttribute('data-tag', 'red')
    expect(container.querySelector('[data-tag]')).toHaveTextContent('¡Voto guardado!')
  })

  it('en modo serio el rótulo desaparece (global.css) y la región viva se queda', () => {
    document.documentElement.setAttribute('data-serious', '')
    render(<Announcer text="Ronda 01" />)
    expect(screen.getByRole('status')).toHaveTextContent('Ronda 01')
    document.documentElement.removeAttribute('data-serious')
  })
})
