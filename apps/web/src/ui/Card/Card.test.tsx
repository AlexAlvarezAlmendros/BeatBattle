import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { type MatchMediaController, mockMatchMedia } from '../../hooks/mockMatchMedia'
import { COARSE_POINTER_QUERY } from '../../hooks/useMediaQuery'
import { REDUCED_MOTION_QUERY } from '../../hooks/useReducedMotion'
import { GLARE_X_VAR } from '../../hooks/useTilt'
import { Card } from './Card'

let media: MatchMediaController | undefined
afterEach(() => {
  media?.restore()
  media = undefined
  document.documentElement.removeAttribute('data-motion')
})

describe('Card', () => {
  it('es un <article> de cristal por defecto, con su contenido y un brillo decorativo', () => {
    media = mockMatchMedia()
    render(
      <Card aria-label="Tigre púrpura">
        <h3>Tigre púrpura</h3>
      </Card>,
    )
    const card = screen.getByRole('article', { name: 'Tigre púrpura' })
    expect(card).toHaveAttribute('data-surface', 'glass')
    expect(card).toHaveAttribute('data-tilt', 'on')
    expect(card.querySelector('[aria-hidden="true"]')).not.toBeNull()
  })

  it('variante maciza y otros elementos raíz', () => {
    render(
      <ul>
        <Card as="li" surface="solid">
          Fila
        </Card>
      </ul>,
    )
    expect(screen.getByRole('listitem')).toHaveAttribute('data-surface', 'solid')
  })

  it('con ratón se inclina siguiendo al cursor', () => {
    media = mockMatchMedia()
    render(<Card data-testid="card">Carta</Card>)
    const card = screen.getByTestId('card')
    card.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 400 }) as DOMRect
    fireEvent.pointerMove(card, { clientX: 300, clientY: 0, pointerType: 'mouse' })
    expect(card.style.getPropertyValue(GLARE_X_VAR)).toBe('100.0%')
  })

  it('RNF-A11Y-03 / RD-MOT-03: sin movimiento no hay 3D, solo el borde que se ilumina', () => {
    media = mockMatchMedia({ [REDUCED_MOTION_QUERY]: true })
    render(<Card data-testid="card">Carta</Card>)
    const card = screen.getByTestId('card')
    expect(card).toHaveAttribute('data-tilt', 'off')
    card.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 400 }) as DOMRect
    fireEvent.pointerMove(card, { clientX: 300, clientY: 0, pointerType: 'mouse' })
    expect(card.style.transform).toBe('')
  })

  it('en táctil y con tilt={false} tampoco se inclina', () => {
    media = mockMatchMedia({ [COARSE_POINTER_QUERY]: true })
    render(
      <>
        <Card data-testid="touch">A</Card>
        <Card data-testid="off" tilt={false}>
          B
        </Card>
      </>,
    )
    expect(screen.getByTestId('touch')).toHaveAttribute('data-tilt', 'off')
    expect(screen.getByTestId('off')).toHaveAttribute('data-tilt', 'off')
  })

  it('RD-VIS-03: hover y foco forzados', () => {
    render(
      <>
        <Card data-testid="hover" state="hover">
          A
        </Card>
        <Card data-testid="focus" state="focus">
          B
        </Card>
      </>,
    )
    expect(screen.getByTestId('hover')).toHaveAttribute('data-force-state', 'hover')
    expect(screen.getByTestId('focus')).toHaveAttribute('data-force-state', 'focus')
  })
})
