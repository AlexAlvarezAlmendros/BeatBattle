import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../i18n'
import { Toast } from './Toast'
import { ToastViewport } from './ToastViewport'
import { TOAST_DURATION_MS, TOAST_LIMIT, toast, useToasts } from './useToasts'

beforeEach(() => {
  useToasts.getState().clear()
})

afterEach(() => {
  vi.useRealTimers()
  act(() => useToasts.getState().clear())
})

const politeRegion = () => document.querySelector<HTMLElement>('[aria-live="polite"]')!
const assertiveRegion = () => document.querySelector<HTMLElement>('[aria-live="assertive"]')!

describe('Toast: almacén', () => {
  it('push devuelve un id, dismiss lo quita y hay un tope de avisos a la vez', () => {
    const id = toast.success('Beat subido')
    expect(useToasts.getState().toasts).toMatchObject([{ id, tone: 'success', duration: TOAST_DURATION_MS }])
    toast.dismiss(id)
    expect(useToasts.getState().toasts).toHaveLength(0)
    for (let i = 0; i < TOAST_LIMIT + 2; i++) toast.info(`Aviso ${i}`)
    const titles = useToasts.getState().toasts.map((item) => item.title)
    expect(titles).toHaveLength(TOAST_LIMIT)
    expect(titles.at(-1)).toBe(`Aviso ${TOAST_LIMIT + 1}`)
  })
})

describe('ToastViewport', () => {
  it('RNF-A11Y-07: las dos regiones vivas existen antes del primer aviso', () => {
    render(<ToastViewport />)
    expect(screen.getByRole('region', { name: t('ui.toast.region') })).toBeInTheDocument()
    expect(politeRegion()).toBeEmptyDOMElement()
    expect(assertiveRegion()).toBeEmptyDOMElement()
  })

  it('RNF-A11Y-07: información y éxito van a la región polite; los errores, a la assertive', () => {
    render(<ToastViewport />)
    act(() => {
      toast.success('Beat subido')
      toast.error('Se ha cortado la subida', { message: 'Tu ficha sigue aquí: reintenta.' })
    })
    expect(within(politeRegion()).getByText('Beat subido')).toBeInTheDocument()
    expect(within(assertiveRegion()).getByText('Se ha cortado la subida')).toBeInTheDocument()
    // El tono se dice con palabras, no solo con color.
    expect(within(assertiveRegion()).getByRole('img', { name: t('ui.toast.tone.error') })).toBeInTheDocument()
  })

  it('se cierra solo a los 4 s', () => {
    vi.useFakeTimers()
    render(<ToastViewport />)
    act(() => {
      toast.info('Nueva entrada')
    })
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS - 1))
    expect(useToasts.getState().toasts).toHaveLength(1)
    act(() => vi.advanceTimersByTime(1))
    expect(useToasts.getState().toasts).toHaveLength(0)
  })

  it('la cuenta se pausa con el ratón encima y con el foco dentro (WCAG 2.2.1)', () => {
    vi.useFakeTimers()
    render(<ToastViewport />)
    act(() => {
      toast.info('Nueva entrada')
    })
    const item = within(politeRegion()).getByRole('listitem')
    act(() => vi.advanceTimersByTime(3000))
    fireEvent.pointerEnter(item)
    act(() => vi.advanceTimersByTime(10_000))
    expect(useToasts.getState().toasts).toHaveLength(1)
    fireEvent.pointerLeave(item)
    fireEvent.focus(within(item).getByRole('button', { name: t('ui.toast.close') }))
    act(() => vi.advanceTimersByTime(10_000))
    expect(useToasts.getState().toasts).toHaveLength(1)
    fireEvent.blur(within(item).getByRole('button', { name: t('ui.toast.close') }))
    // Quedaba 1 s de los 4.
    act(() => vi.advanceTimersByTime(999))
    expect(useToasts.getState().toasts).toHaveLength(1)
    act(() => vi.advanceTimersByTime(1))
    expect(useToasts.getState().toasts).toHaveLength(0)
  })

  it('RNF-A11Y-01: el botón de cerrar funciona con teclado', async () => {
    const user = userEvent.setup()
    render(<ToastViewport />)
    act(() => {
      toast.error('Error al votar', { duration: null })
    })
    await user.tab()
    expect(screen.getByRole('button', { name: t('ui.toast.close') })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(useToasts.getState().toasts).toHaveLength(0)
    await waitFor(() => expect(assertiveRegion()).toBeEmptyDOMElement())
  })

  it('RNF-A11Y-01: al cerrar un aviso con el teclado, el foco pasa al siguiente y, sin más, vuelve a donde estaba', async () => {
    const user = userEvent.setup()
    render(
      <>
        <button type="button">Antes</button>
        <ToastViewport />
      </>,
    )
    act(() => {
      toast.info('Primero', { duration: null })
      toast.error('Segundo', { duration: null })
    })
    const before = screen.getByRole('button', { name: 'Antes' })
    await user.tab()
    expect(before).toHaveFocus()
    await user.tab()
    const [first, second] = screen.getAllByRole('button', { name: t('ui.toast.close') })
    expect(first).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(second).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(useToasts.getState().toasts).toHaveLength(0)
    expect(before).toHaveFocus()
  })

  it('RNF-A11Y-01: si el tope expulsa el aviso con el foco, el foco pasa al siguiente', async () => {
    const user = userEvent.setup()
    render(<ToastViewport />)
    act(() => {
      for (let i = 0; i < TOAST_LIMIT; i++) toast.info(`Aviso ${i}`, { duration: null })
    })
    await user.tab()
    const oldest = within(politeRegion()).getAllByRole('listitem')[0]!
    expect(within(oldest).getByRole('button')).toHaveFocus()
    act(() => {
      toast.info('Uno más', { duration: null })
    })
    const next = within(politeRegion())
      .getAllByRole('listitem')
      .find((item) => item.textContent?.includes('Aviso 1'))!
    expect(within(next).getByRole('button')).toHaveFocus()
  })

  it('con duration: null no se cierra solo', () => {
    vi.useFakeTimers()
    render(<ToastViewport />)
    act(() => {
      toast.error('Persistente', { duration: null })
    })
    act(() => vi.advanceTimersByTime(60_000))
    expect(useToasts.getState().toasts).toHaveLength(1)
  })
})

describe('Toast (pieza)', () => {
  it('RD-VIS-03: estados forzados y sin botón de cerrar si no se puede cerrar', () => {
    const { container } = render(<Toast toast={{ tone: 'info', title: 'Aviso' }} state="hover" />)
    expect(container.querySelector('[data-force-state="hover"]')).not.toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
