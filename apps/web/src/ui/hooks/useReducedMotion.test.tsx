import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { type MatchMediaController, mockMatchMedia } from './mockMatchMedia'
import { useMediaQuery } from './useMediaQuery'

/** Una consulta cualquiera para probar la suscripción de `useMediaQuery`: la del táctil. */
const COARSE_POINTER_QUERY = '(hover: none), (pointer: coarse)'

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

describe('suscripciones compartidas', () => {
  it('cien instancias comparten un MutationObserver y un oyente por consulta; con la última se quitan', async () => {
    media = mockMatchMedia()
    // Cuenta los oyentes de `change` y los observadores creados.
    const mocked = window.matchMedia
    const active = new Map<string, number>()
    window.matchMedia = (query: string) => {
      const list = mocked(query)
      const add = list.addEventListener.bind(list)
      const remove = list.removeEventListener.bind(list)
      list.addEventListener = ((type: string, listener: () => void) => {
        active.set(query, (active.get(query) ?? 0) + 1)
        add(type as 'change', listener)
      }) as typeof list.addEventListener
      list.removeEventListener = ((type: string, listener: () => void) => {
        active.set(query, (active.get(query) ?? 0) - 1)
        remove(type as 'change', listener)
      }) as typeof list.removeEventListener
      return list
    }
    const Original = window.MutationObserver
    let observers = 0
    let connected = 0
    window.MutationObserver = class extends Original {
      constructor(callback: MutationCallback) {
        super(callback)
        observers += 1
      }
      override observe(target: Node, options?: MutationObserverInit) {
        connected += 1
        super.observe(target, options)
      }
      override disconnect() {
        connected -= 1
        super.disconnect()
      }
    }
    try {
      const { unmount } = render(
        <div>
          {Array.from({ length: 100 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: sondas idénticas
            <Probe key={i} />
          ))}
        </div>,
      )
      expect(observers).toBe(1)
      expect(connected).toBe(1)
      expect(active.get(REDUCED_MOTION_QUERY)).toBe(1)
      expect(active.get(COARSE_POINTER_QUERY)).toBe(1)
      // Y todas se enteran de un cambio.
      await act(async () => setReducedMotion(true))
      expect(screen.getAllByTestId('reduced').every((el) => el.textContent === 'true')).toBe(true)
      act(() => media?.set(COARSE_POINTER_QUERY, true))
      expect(screen.getAllByTestId('coarse').every((el) => el.textContent === 'true')).toBe(true)
      unmount()
      expect(connected).toBe(0)
      expect(active.get(REDUCED_MOTION_QUERY)).toBe(0)
      expect(active.get(COARSE_POINTER_QUERY)).toBe(0)
    } finally {
      window.MutationObserver = Original
    }
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
