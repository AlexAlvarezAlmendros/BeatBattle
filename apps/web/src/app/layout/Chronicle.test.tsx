import { loop } from '@beatbattle/shared/tokens'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../i18n'
import { useLoops } from '../../ui/loops'
import { Chronicle, CreditLine } from './Chronicle'

const MESSAGES = ['Próximo drop en el horno', 'Un sample cada lunes', 'La comunidad vota'] as const

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  document.documentElement.removeAttribute('data-motion')
  useLoops.getState().set(false)
})

describe('crónica de la arena (§3.8.3)', () => {
  it('cambia de mensaje cada 5 s (--bb-loop-chronicle) y vuelve al primero', () => {
    render(<Chronicle messages={MESSAGES} label="Crónica de la arena" />)
    expect(screen.getByText(MESSAGES[0])).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(loop.chronicle))
    expect(screen.getByText(MESSAGES[1])).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(loop.chronicle * 2))
    expect(screen.getByText(MESSAGES[0])).toBeInTheDocument()
  })

  it('no es una región viva y lleva su nombre para los lectores de pantalla', () => {
    render(<Chronicle messages={MESSAGES} label="Crónica de la arena" />)
    const line = screen.getByText(MESSAGES[0]).closest('[data-chronicle]')!
    expect(line).toHaveAttribute('aria-live', 'off')
    expect(line).toHaveTextContent('Crónica de la arena:')
  })

  it('RNF-A11Y-03: con «reducir movimiento» sigue rotando cada 5 s, sin fundido (la crónica es información, §3.6)', () => {
    document.documentElement.setAttribute('data-motion', 'reduced')
    render(<Chronicle messages={MESSAGES} label="Crónica de la arena" />)
    expect(screen.getByText(MESSAGES[0]).closest('[data-chronicle]')).toHaveAttribute('data-static', 'true')
    act(() => vi.advanceTimersByTime(loop.chronicle))
    expect(screen.getByText(MESSAGES[1])).toBeInTheDocument()
    expect(screen.getByText(MESSAGES[1]).closest('[data-chronicle]')).toHaveAttribute('data-static', 'true')
  })

  it('RNF-A11Y-03 / WCAG 2.2.2: con «reducir movimiento» el botón «Pausar las animaciones» sigue ahí y la para', () => {
    document.documentElement.setAttribute('data-motion', 'reduced')
    render(<Chronicle messages={MESSAGES} label="Crónica de la arena" loops />)
    const pause = screen.getByRole('button', { name: t('frame.controls.loopsPause') })
    act(() => vi.advanceTimersByTime(loop.chronicle))
    expect(screen.getByText(MESSAGES[1])).toBeInTheDocument()
    fireEvent.click(pause)
    expect(pause).toHaveAttribute('aria-pressed', 'true')
    act(() => vi.advanceTimersByTime(loop.chronicle * 3))
    expect(screen.getByText(MESSAGES[1])).toBeInTheDocument()
  })

  it('WCAG 2.2.2: un botón de 44 px con aria-pressed («Pausar las animaciones») la pausa y la reanuda', () => {
    render(<Chronicle messages={MESSAGES} label="Crónica de la arena" />)
    const pause = screen.getByRole('button', { name: t('frame.controls.loopsPause') })
    expect(pause).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(pause)
    expect(pause).toHaveAttribute('aria-pressed', 'true')
    act(() => vi.advanceTimersByTime(loop.chronicle * 3))
    expect(screen.getByText(MESSAGES[0])).toBeInTheDocument()
    fireEvent.click(pause)
    act(() => vi.advanceTimersByTime(loop.chronicle))
    expect(screen.getByText(MESSAGES[1])).toBeInTheDocument()
  })

  it('WCAG 2.2.2: con el foco dentro (teclado) no cambia; al salir, sigue', () => {
    render(
      <>
        <Chronicle messages={MESSAGES} label="Crónica de la arena" />
        <button type="button">Fuera</button>
      </>,
    )
    const pause = screen.getByRole('button', { name: t('frame.controls.loopsPause') })
    act(() => pause.focus())
    act(() => vi.advanceTimersByTime(loop.chronicle * 2))
    expect(screen.getByText(MESSAGES[0])).toBeInTheDocument()
    act(() => screen.getByRole('button', { name: 'Fuera' }).focus())
    act(() => vi.advanceTimersByTime(loop.chronicle))
    expect(screen.getByText(MESSAGES[1])).toBeInTheDocument()
  })

  it('WCAG 2.2.2: la pausa es de toda la página: marca <html data-loops="paused"> para los demás bucles', () => {
    render(<Chronicle messages={MESSAGES} label="Crónica de la arena" loops />)
    const pause = screen.getByRole('button', { name: t('frame.controls.loopsPause') })
    fireEvent.click(pause)
    expect(document.documentElement).toHaveAttribute('data-loops', 'paused')
    expect(useLoops.getState().paused).toBe(true)
    fireEvent.click(pause)
    expect(document.documentElement).not.toHaveAttribute('data-loops')
  })

  it('con un solo mensaje y sin otros bucles no hay nada que pausar: sin botón', () => {
    render(<Chronicle messages={[MESSAGES[0]]} label="Crónica de la arena" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('WCAG 2.2.2: con un solo mensaje pero otros bucles en la pantalla (loops), sí hay botón', () => {
    render(<Chronicle messages={[MESSAGES[0]]} label="Crónica de la arena" loops />)
    expect(screen.getByRole('button', { name: t('frame.controls.loopsPause') })).toBeInTheDocument()
  })

  it('RNF-A11Y-03: con «reducir movimiento» y un solo mensaje, los bucles ya están parados: sin botón', () => {
    document.documentElement.setAttribute('data-motion', 'reduced')
    render(<Chronicle messages={[MESSAGES[0]]} label="Crónica de la arena" loops />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('RD-VIS-02 e / WCAG 1.4.4: el crédito, en dos líneas, solo parte por el «·» y no antes de él', () => {
    // Revisión del cuarto pase del jurado de la 0.28 (F6): con la letra a 24 px partía en «Inserta tu
    // beat» / «· Crédito 01». Los demás espacios son de no separación: «Inserta tu beat ·» / «Crédito 01».
    const { container, rerender } = render(<CreditLine inside={false} />)
    const text = () => container.querySelector('[data-credit]')?.textContent
    expect(text()).toBe('Inserta\u00a0tu\u00a0beat\u00a0· Crédito\u00a001')
    rerender(<CreditLine inside />)
    expect(text()).toBe('Crédito\u00a000\u00a0· ya\u00a0estás\u00a0dentro')
  })
})
