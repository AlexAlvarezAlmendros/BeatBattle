import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../i18n'

/**
 * Carga en diferido de la zona de avisos (§3.3, §4.17): las regiones vivas se pintan vacías al
 * montarse y la parte animada (`ToastList`, con Motion) llega aparte. Aquí `./ToastList` se sirve
 * cuando el test lo dice, para ver qué hay antes y después.
 */

const gate = vi.hoisted(() => {
  const state = {
    requests: 0,
    fail: false,
    release: () => {},
    ready: Promise.resolve(),
    reset() {
      state.requests = 0
      state.fail = false
      state.ready = new Promise<void>((resolve) => {
        state.release = resolve
      })
    },
  }
  return state
})

/**
 * Módulos frescos en cada test (la caché de la parte animada es del módulo), con `./ToastList` detrás
 * de la compuerta: cuenta las peticiones y no responde hasta `gate.release()`.
 */
async function load() {
  vi.resetModules()
  vi.doMock('./ToastList', async (importOriginal) => {
    gate.requests += 1
    await gate.ready
    if (gate.fail) throw new Error('Failed to fetch dynamically imported module')
    return importOriginal()
  })
  const viewport = await import('./ToastViewport')
  const store = await import('./useToasts')
  return { ...viewport, ...store }
}

const politeRegion = () => document.querySelector<HTMLElement>('[aria-live="polite"]')!
const assertiveRegion = () => document.querySelector<HTMLElement>('[aria-live="assertive"]')!

beforeEach(() => {
  gate.reset()
})

afterEach(() => {
  vi.unstubAllGlobals()
  gate.release()
})

describe('ToastViewport: parte animada en diferido', () => {
  it('RNF-A11Y-07: las dos regiones vivas se pintan vacías al montar; la parte animada se pide después de pintar, con el navegador libre', async () => {
    // Fotogramas y ratos libres a mano, para ver en qué momento se pide la parte animada.
    const frames: FrameRequestCallback[] = []
    const idle: IdleRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback))
    vi.stubGlobal('cancelAnimationFrame', () => {})
    vi.stubGlobal('requestIdleCallback', (callback: IdleRequestCallback) => idle.push(callback))
    vi.stubGlobal('cancelIdleCallback', () => {})
    const tick = () => new Promise((resolve) => setTimeout(resolve, 20))
    const { ToastViewport } = await load()
    const { unmount } = render(<ToastViewport />)
    expect(screen.getByRole('region', { name: t('ui.toast.region') })).toBeInTheDocument()
    expect(politeRegion()).toHaveAttribute('role', 'list')
    expect(politeRegion()).toBeEmptyDOMElement()
    expect(assertiveRegion()).toHaveAttribute('role', 'list')
    expect(assertiveRegion()).toBeEmptyDOMElement()

    // Al montar, nada de Motion: solo espera al fotograma.
    await tick()
    expect(frames).toHaveLength(1)
    expect(gate.requests).toBe(0)
    // Pintado el fotograma, espera a que el navegador quede libre.
    frames[0]!(performance.now())
    await tick()
    expect(idle).toHaveLength(1)
    expect(gate.requests).toBe(0)
    // Con el navegador libre, se pide (una vez).
    idle[0]!({ didTimeout: false, timeRemaining: () => 50 })
    await vi.waitFor(() => expect(gate.requests).toBe(1))
    // Desmontar con los globales aún sustituidos (la limpieza cancela su rato libre).
    unmount()
  })

  it('RNF-A11Y-07: un aviso lanzado antes de que llegue la parte animada sale en su región en cuanto llega', async () => {
    const { ToastViewport, toast } = await load()
    render(<ToastViewport />)
    act(() => {
      toast.error('Se ha cortado la subida')
    })
    // El aviso adelanta la petición (sin esperar al navegador libre); mientras llega, la región sigue ahí.
    await waitFor(() => expect(gate.requests).toBe(1))
    expect(assertiveRegion()).toBeEmptyDOMElement()
    await act(async () => {
      gate.release()
    })
    expect(await within(assertiveRegion()).findByText('Se ha cortado la subida')).toBeInTheDocument()
    expect(politeRegion()).toBeEmptyDOMElement()
  })

  it('una sola petición de la parte animada, aunque haya dos regiones y varios avisos', async () => {
    const { ToastViewport, toast } = await load()
    render(<ToastViewport />)
    act(() => {
      toast.info('Nueva entrada')
      toast.error('Error al votar')
    })
    await act(async () => {
      gate.release()
    })
    expect(await within(politeRegion()).findByText('Nueva entrada')).toBeInTheDocument()
    expect(await within(assertiveRegion()).findByText('Error al votar')).toBeInTheDocument()
    expect(gate.requests).toBe(1)
  })

  it('si la parte animada no llega, los avisos salen sin animar: tono en palabras, texto y cerrar', async () => {
    const user = userEvent.setup()
    const { ToastViewport, toast, useToasts } = await load()
    render(<ToastViewport />)
    gate.fail = true
    act(() => {
      toast.error('Se ha cortado la subida', { message: 'Tu ficha sigue aquí: reintenta.', duration: null })
    })
    await act(async () => {
      gate.release()
    })
    const item = await within(assertiveRegion()).findByRole('listitem')
    expect(item).toHaveTextContent(`${t('ui.toast.tone.error')}: Se ha cortado la subida`)
    expect(item).toHaveTextContent('Tu ficha sigue aquí: reintenta.')
    await user.click(within(item).getByRole('button', { name: t('ui.toast.close') }))
    expect(useToasts.getState().toasts).toHaveLength(0)
    expect(assertiveRegion()).toBeEmptyDOMElement()
  })
})
