import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../i18n'
import {
  countdownParts,
  countdownPhase,
  crossedMilestone,
  DAY_MS,
  HOUR_MS,
  MINUTE_MS,
  msToNextSecond,
} from './countdown'
import { RoundClock } from './RoundClock'

const TARGET = Date.UTC(2026, 9, 11, 18, 0, 0)

function testClock(startMs: number) {
  let current = startMs
  return {
    now: () => current,
    advance(ms: number) {
      current += ms
      act(() => vi.advanceTimersByTime(ms))
    },
  }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('reloj de ronda: cálculos', () => {
  it('partes con los segundos redondeados hacia arriba, fases e hitos', () => {
    expect(countdownParts(DAY_MS + HOUR_MS + MINUTE_MS + 1)).toEqual({
      days: 1,
      hours: 1,
      minutes: 1,
      seconds: 1,
    })
    expect(countdownPhase(DAY_MS + 1)).toBe('normal')
    expect(countdownPhase(DAY_MS)).toBe('urgent')
    expect(countdownPhase(HOUR_MS)).toBe('final')
    expect(countdownPhase(0)).toBe('ended')
    expect(crossedMilestone(HOUR_MS + 1, HOUR_MS)).toBe('hour')
    expect(crossedMilestone(HOUR_MS - 1, HOUR_MS - 2)).toBeNull()
    expect(msToNextSecond(1500)).toBe(500)
  })
})

describe('RoundClock (§3.3 «Reloj de ronda», 0.25)', () => {
  it('RNF-A11Y-07: temporizador con nombre y el tiempo restante en texto; dígitos y unidades a la vista', () => {
    const clock = testClock(TARGET - (4 * DAY_MS + 7 * HOUR_MS + 12 * MINUTE_MS + 45_000))
    render(
      <RoundClock
        target={TARGET}
        now={clock.now}
        label="Tiempo · cierre de envíos"
        week={{ today: 2, progress: 0.36 }}
      />,
    )
    const timer = screen.getByRole('timer', { name: 'Tiempo · cierre de envíos' })
    expect(timer).toHaveTextContent(/4 días, 7 horas, 12 minutos y 45 segundos/)
    expect([...timer.querySelectorAll('b')].map((digits) => digits.textContent)).toEqual([
      '04',
      '07',
      '12',
      '45',
    ])
    expect(timer).toHaveTextContent(t('ui.roundClock.units.days'))
    expect(document.querySelectorAll('[data-day]')).toHaveLength(7)
    expect(document.querySelector('[data-day="today"]')).toHaveTextContent(t('ui.roundClock.days.wed'))
    clock.advance(1000)
    expect(timer).toHaveTextContent(/44 segundos/)
  })

  it('≤ 24 h urgente, ≤ 1 h latido, y agotado «¡TIEMPO!» (su estado de error) con el aviso del hito', () => {
    const clock = testClock(TARGET - 2000)
    const onEnd = vi.fn()
    const { container } = render(<RoundClock target={TARGET} now={clock.now} label="Cierre" onEnd={onEnd} />)
    const frame = container.querySelector('[data-phase]')!
    expect(frame).toHaveAttribute('data-phase', 'final')
    clock.advance(2000)
    expect(frame).toHaveAttribute('data-phase', 'ended')
    expect(frame).toHaveTextContent(t('ui.roundClock.timeUp'))
    expect(
      screen.getByText(t('ui.roundClock.milestone.ended'), { selector: '[aria-live]' }),
    ).toBeInTheDocument()
    expect(onEnd).toHaveBeenCalledTimes(1)
  })
})
