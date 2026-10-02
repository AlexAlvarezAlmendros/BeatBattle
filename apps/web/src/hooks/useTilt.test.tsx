import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { type MatchMediaController, mockMatchMedia } from './mockMatchMedia'
import { COARSE_POINTER_QUERY } from './useMediaQuery'
import { REDUCED_MOTION_QUERY } from './useReducedMotion'
import { GLARE_X_VAR, GLARE_Y_VAR, TILT_MAX_DEG, tiltAngles, tiltTransform, useTilt } from './useTilt'

function TiltBox() {
  const tilt = useTilt<HTMLDivElement>()
  return (
    <div ref={tilt.ref} data-testid="box" data-tilt={tilt.enabled ? 'on' : 'off'} {...tilt.handlers}>
      tarjeta
    </div>
  )
}

let media: MatchMediaController | undefined
afterEach(() => {
  media?.restore()
  media = undefined
  document.documentElement.removeAttribute('data-motion')
})

/** jsdom no maqueta: la caja mide 200×100 en (0, 0). */
function stubRect(element: HTMLElement) {
  element.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0 }) as DOMRect
}

describe('useTilt', () => {
  it('ángulos: 0° en el centro y ±6° como mucho en los bordes (§3.3)', () => {
    expect(tiltAngles(0.5, 0.5)).toEqual({ rotateX: 0, rotateY: 0 })
    expect(tiltAngles(1, 0)).toEqual({ rotateX: TILT_MAX_DEG, rotateY: TILT_MAX_DEG })
    expect(tiltAngles(0, 1)).toEqual({ rotateX: -TILT_MAX_DEG, rotateY: -TILT_MAX_DEG })
    // Fuera de la pieza no pasa del máximo.
    expect(tiltAngles(2, -1)).toEqual({ rotateX: TILT_MAX_DEG, rotateY: TILT_MAX_DEG })
    expect(tiltTransform(3, -4.5)).toBe('perspective(800px) rotateX(3deg) rotateY(-4.5deg)')
  })

  it('con ratón, sigue al cursor: brillo especular en la posición del puntero', () => {
    media = mockMatchMedia()
    render(<TiltBox />)
    const box = screen.getByTestId('box')
    expect(box).toHaveAttribute('data-tilt', 'on')
    stubRect(box)
    fireEvent.pointerMove(box, { clientX: 150, clientY: 25, pointerType: 'mouse' })
    expect(box.style.getPropertyValue(GLARE_X_VAR)).toBe('75.0%')
    expect(box.style.getPropertyValue(GLARE_Y_VAR)).toBe('25.0%')
  })

  it('RNF-A11Y-03: con «reducir movimiento» no hay 3D ni manejadores', () => {
    media = mockMatchMedia({ [REDUCED_MOTION_QUERY]: true })
    render(<TiltBox />)
    const box = screen.getByTestId('box')
    expect(box).toHaveAttribute('data-tilt', 'off')
    stubRect(box)
    fireEvent.pointerMove(box, { clientX: 150, clientY: 25, pointerType: 'mouse' })
    expect(box.style.transform).toBe('')
    expect(box.style.getPropertyValue(GLARE_X_VAR)).toBe('')
  })

  it('RNF-A11Y-03: también con el ajuste propio data-motion="reduced"', () => {
    media = mockMatchMedia()
    document.documentElement.setAttribute('data-motion', 'reduced')
    render(<TiltBox />)
    expect(screen.getByTestId('box')).toHaveAttribute('data-tilt', 'off')
  })

  it('con puntero táctil no se inclina', () => {
    media = mockMatchMedia({ [COARSE_POINTER_QUERY]: true })
    render(<TiltBox />)
    expect(screen.getByTestId('box')).toHaveAttribute('data-tilt', 'off')
  })
})
