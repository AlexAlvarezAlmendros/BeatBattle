import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { type MatchMediaController, mockMatchMedia } from './mockMatchMedia'
import { COARSE_POINTER_QUERY, useMediaQuery } from './useMediaQuery'
import {
  hasReducedMotionSetting,
  isReducedMotion,
  REDUCED_MOTION_QUERY,
  setReducedMotion,
  useReducedMotion,
} from './useReducedMotion'

function Probe() {
  const reduced = useReducedMotion()
  const coarse = useMediaQuery(COARSE_POINTER_QUERY)
  return (
    <p>
      <span data-testid="reduced">{String(reduced)}</span>
      <span data-testid="coarse">{String(coarse)}</span>
    </p>
  )
}

let media: MatchMediaController | undefined

afterEach(() => {
  media?.restore()
  media = undefined
  document.documentElement.removeAttribute('data-motion')
})

describe('useReducedMotion', () => {
  it('RNF-A11Y-03: sin preferencia ni ajuste, hay movimiento', () => {
    media = mockMatchMedia()
    render(<Probe />)
    expect(screen.getByTestId('reduced')).toHaveTextContent('false')
    expect(isReducedMotion()).toBe(false)
  })

  it('RNF-A11Y-03: respeta prefers-reduced-motion y su cambio en caliente', () => {
    media = mockMatchMedia({ [REDUCED_MOTION_QUERY]: true })
    render(<Probe />)
    expect(screen.getByTestId('reduced')).toHaveTextContent('true')
    act(() => media?.set(REDUCED_MOTION_QUERY, false))
    expect(screen.getByTestId('reduced')).toHaveTextContent('false')
  })

  it('RNF-A11Y-08: respeta el ajuste propio <html data-motion="reduced"> aunque el sistema no lo pida', async () => {
    media = mockMatchMedia()
    render(<Probe />)
    expect(screen.getByTestId('reduced')).toHaveTextContent('false')
    // El MutationObserver avisa en una microtarea.
    await act(async () => setReducedMotion(true))
    expect(document.documentElement).toHaveAttribute('data-motion', 'reduced')
    expect(hasReducedMotionSetting()).toBe(true)
    expect(screen.getByTestId('reduced')).toHaveTextContent('true')
    await act(async () => setReducedMotion(false))
    expect(document.documentElement).not.toHaveAttribute('data-motion')
    expect(screen.getByTestId('reduced')).toHaveTextContent('false')
  })

  it('sin matchMedia (jsdom, servidor) no rompe: solo mira el atributo', () => {
    expect(typeof window.matchMedia).toBe('undefined')
    render(<Probe />)
    expect(screen.getByTestId('reduced')).toHaveTextContent('false')
    expect(screen.getByTestId('coarse')).toHaveTextContent('false')
    document.documentElement.setAttribute('data-motion', 'reduced')
    expect(isReducedMotion()).toBe(true)
  })
})

describe('useMediaQuery', () => {
  it('sigue la consulta y su cambio (puntero táctil)', () => {
    media = mockMatchMedia({ [COARSE_POINTER_QUERY]: true })
    render(<Probe />)
    expect(screen.getByTestId('coarse')).toHaveTextContent('true')
    act(() => media?.set(COARSE_POINTER_QUERY, false))
    expect(screen.getByTestId('coarse')).toHaveTextContent('false')
  })
})
