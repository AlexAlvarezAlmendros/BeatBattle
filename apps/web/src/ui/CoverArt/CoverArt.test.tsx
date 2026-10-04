import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { COVER_RADIUS, CoverArt } from './CoverArt'

/** Proporción del disco del emblema (radio `COVER_RADIUS` en el `viewBox` de 100) que cubren unos círculos. */
function share(circles: Element[]): number {
  const area = circles.reduce((sum, circle) => sum + Math.PI * Number(circle.getAttribute('r')) ** 2, 0)
  return area / (Math.PI * COVER_RADIUS ** 2)
}

describe('CoverArt: la portada del voto ciego (§3.4.5, §1.3)', () => {
  it('RD-VIS-04: es la portada de referencia de las maquetas, con el presupuesto de tinta de §3.4.5 (11,5 % rojo y 1,6 % blanco del disco, ±5 %)', () => {
    const { container } = render(<CoverArt />)
    const red = [...container.querySelectorAll('[data-ink="red"]')]
    const white = [...container.querySelectorAll('[data-ink="white"]')]
    expect(red.length).toBeGreaterThan(100)
    expect(white.length).toBeGreaterThan(20)
    expect(Math.abs(share(red) - 0.115)).toBeLessThanOrEqual(0.115 * 0.05)
    expect(Math.abs(share(white) - 0.016)).toBeLessThanOrEqual(0.016 * 0.05)
  })

  it('§1.3: todas las entradas llevan la misma portada (ninguna se distingue) y es decorativa', () => {
    const { container } = render(
      <>
        <CoverArt />
        <CoverArt />
      </>,
    )
    const [first, second] = container.querySelectorAll('svg')
    expect(first?.innerHTML).toBe(second?.innerHTML)
    expect(first).toHaveAttribute('aria-hidden', 'true')
  })
})
