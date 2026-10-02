import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type MatchMediaController, mockMatchMedia } from '../../hooks/mockMatchMedia'
import { COARSE_POINTER_QUERY } from '../../hooks/useMediaQuery'
import { REDUCED_MOTION_QUERY } from '../../hooks/useReducedMotion'
import { GLARE_X_VAR } from '../../hooks/useTilt'
import { GlassProvider, resetGlassCapabilityCache } from '../glass'
import { Card } from './Card'
import cardCss from './Card.module.css?raw'

let media: MatchMediaController | undefined
afterEach(() => {
  media?.restore()
  media = undefined
  document.documentElement.removeAttribute('data-motion')
  vi.unstubAllGlobals()
  resetGlassCapabilityCache()
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

  it('RNF-PERF-03: sin el ratón encima no reserva una capa compuesta (will-change solo en hover)', () => {
    media = mockMatchMedia()
    render(<Card data-testid="card">Carta</Card>)
    const card = screen.getByTestId('card')
    expect(card).toHaveAttribute('data-tilt', 'on')
    expect(getComputedStyle(card).getPropertyValue('will-change')).not.toBe('transform')
    expect(cardCss).toMatch(/\.card\[data-tilt="on"\]:hover \{\s*will-change: transform;/)
  })

  it('RD-VIS-01: el cristal es GlassSurface (con su alternativa sin capacidad); la maciza no lleva filtro', () => {
    media = mockMatchMedia()
    vi.stubGlobal('CSS', { supports: () => true })
    resetGlassCapabilityCache()
    render(
      <>
        <Card data-testid="glass">Cristal</Card>
        <GlassProvider enabled={false}>
          <Card data-testid="fallback">Alternativa</Card>
        </GlassProvider>
        <Card data-testid="solid" surface="solid">
          Maciza
        </Card>
      </>,
    )
    const glass = screen.getByTestId('glass')
    expect(glass).toHaveAttribute('data-glass', 'on')
    expect(glass).toHaveAttribute('data-tilt', 'on')
    expect(glass.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
    expect(screen.getByTestId('fallback')).not.toHaveAttribute('data-glass')
    expect(screen.getByTestId('fallback')).toHaveAttribute('data-surface', 'glass')
    expect(screen.getByTestId('solid')).not.toHaveAttribute('data-glass')
    expect(screen.getByTestId('solid').querySelector('svg')).toBeNull()
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

  it('con ratón se inclina siguiendo al cursor (rotación y brillo)', async () => {
    media = mockMatchMedia()
    render(<Card data-testid="card">Carta</Card>)
    const card = screen.getByTestId('card')
    card.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 400 }) as DOMRect
    // Esquina superior derecha: se inclina hacia arriba (rotateX > 0) y a la derecha (rotateY > 0).
    fireEvent.pointerMove(card, { clientX: 300, clientY: 0, pointerType: 'mouse' })
    expect(card.style.getPropertyValue(GLARE_X_VAR)).toBe('100.0%')
    await waitFor(() =>
      expect(card.style.transform).toMatch(/rotateX\([1-9][\d.]*deg\) rotateY\([1-9][\d.]*deg\)/),
    )
    expect(card.style.transform).toMatch(/^perspective\(800px\)/)
  })

  it('RNF-A11Y-03 / RD-MOT-03: sin movimiento no hay 3D, solo el borde que se ilumina', () => {
    media = mockMatchMedia({ [REDUCED_MOTION_QUERY]: true })
    render(<Card data-testid="card">Carta</Card>)
    const card = screen.getByTestId('card')
    expect(card).toHaveAttribute('data-tilt', 'off')
    card.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 400 }) as DOMRect
    fireEvent.pointerMove(card, { clientX: 300, clientY: 0, pointerType: 'mouse' })
    // El manejador de inclinación no existe: el mismo que mueve el muelle escribe el brillo en el acto
    // (caso de arriba), así que sin brillo tampoco hay giro, sin depender de cuántos fotogramas pasen.
    expect(card.style.getPropertyValue(GLARE_X_VAR)).toBe('')
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
