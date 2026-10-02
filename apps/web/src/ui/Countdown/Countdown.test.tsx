import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../i18n'
import { Countdown } from './Countdown'
import { countdownParts, countdownPhase, crossedMilestone, DAY_MS, HOUR_MS, MINUTE_MS } from './countdown'

/** Sábado 10 de octubre de 2026, 20:00 en Madrid (18:00 UTC). */
const TARGET = Date.UTC(2026, 9, 10, 18, 0, 0)

/** Reloj de prueba: «ahora» lo mueve el test, junto con los temporizadores falsos. */
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

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  document.documentElement.removeAttribute('data-motion')
})

const live = () => document.querySelector('[aria-live="polite"]')!

describe('Countdown: cálculos', () => {
  it('partes con los segundos redondeados hacia arriba', () => {
    expect(countdownParts(2 * DAY_MS + 14 * HOUR_MS + 5 * MINUTE_MS + 33_000)).toEqual({
      days: 2,
      hours: 14,
      minutes: 5,
      seconds: 33,
    })
    expect(countdownParts(500)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 1 })
    expect(countdownParts(-5000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 })
  })

  it('fases: rojo en las últimas 24 h, latido en la última hora', () => {
    expect(countdownPhase(DAY_MS + 1)).toBe('normal')
    expect(countdownPhase(DAY_MS)).toBe('urgent')
    expect(countdownPhase(HOUR_MS)).toBe('final')
    expect(countdownPhase(0)).toBe('ended')
  })

  it('RNF-A11Y-07: hitos de 24 h, 1 h, 10 min y final; ninguno fuera de ellos', () => {
    expect(crossedMilestone(DAY_MS + 1000, DAY_MS)).toBe('day')
    expect(crossedMilestone(HOUR_MS + 1, HOUR_MS - 1)).toBe('hour')
    expect(crossedMilestone(10 * MINUTE_MS + 1000, 10 * MINUTE_MS - 1000)).toBe('tenMinutes')
    expect(crossedMilestone(1000, 0)).toBe('ended')
    expect(crossedMilestone(5 * HOUR_MS, 5 * HOUR_MS - 1000)).toBeNull()
    // Si se cruzan varios a la vez (pestaña dormida), el más cercano al final.
    expect(crossedMilestone(2 * DAY_MS, 5 * MINUTE_MS)).toBe('tenMinutes')
  })
})

describe('Countdown', () => {
  it('es un temporizador con nombre y el tiempo restante en texto', () => {
    const clock = testClock(TARGET - (2 * DAY_MS + 14 * HOUR_MS + 5 * MINUTE_MS + 33_000))
    render(<Countdown target={TARGET} now={clock.now} label="Cierre de votos" />)
    const timer = screen.getByRole('timer', { name: 'Cierre de votos' })
    expect(timer).toHaveTextContent(
      t('ui.countdown.remaining', {
        days: t('ui.countdown.days', { count: 2 }),
        hours: t('ui.countdown.hours', { count: 14 }),
        minutes: t('ui.countdown.minutes', { count: 5 }),
        seconds: t('ui.countdown.seconds', { count: 33 }),
      }),
    )
    expect(timer.closest('[data-phase]')).toHaveAttribute('data-phase', 'normal')
  })

  it('cuenta con la fuente de «ahora» inyectada', () => {
    const clock = testClock(TARGET - 90_000)
    render(<Countdown target={TARGET} now={clock.now} />)
    // Grupos de cifras (días, horas, minutos, segundos), sin las unidades.
    const digits = () =>
      [...screen.getByRole('timer').querySelectorAll('[class*="digits"]')]
        .map((el) => el.textContent)
        .join(':')
    expect(digits()).toBe('00:00:01:30')
    clock.advance(1000)
    expect(digits()).toBe('00:00:01:29')
  })

  it('RNF-A11Y-07: anuncia solo los hitos de 24 h, 1 h y 10 min, y el final', () => {
    const clock = testClock(TARGET - DAY_MS - 2000)
    const onEnd = vi.fn()
    render(<Countdown target={TARGET} now={clock.now} onEnd={onEnd} />)
    expect(live()).toBeEmptyDOMElement()
    clock.advance(1000)
    expect(live()).toBeEmptyDOMElement()
    clock.advance(2000)
    expect(live()).toHaveTextContent(t('ui.countdown.milestone.day'))
    expect(screen.getByRole('timer').closest('[data-phase]')).toHaveAttribute('data-phase', 'urgent')

    clock.advance(DAY_MS - HOUR_MS)
    expect(live()).toHaveTextContent(t('ui.countdown.milestone.hour'))
    expect(screen.getByRole('timer').closest('[data-phase]')).toHaveAttribute('data-phase', 'final')

    clock.advance(HOUR_MS - 10 * MINUTE_MS)
    expect(live()).toHaveTextContent(t('ui.countdown.milestone.tenMinutes'))

    clock.advance(10 * MINUTE_MS)
    expect(live()).toHaveTextContent(t('ui.countdown.milestone.ended'))
    expect(onEnd).toHaveBeenCalledTimes(1)
    clock.advance(5000)
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it('al montar ya dentro de las 24 h no anuncia nada (solo al cruzar un hito)', () => {
    const clock = testClock(TARGET - 5 * HOUR_MS)
    render(<Countdown target={TARGET} now={clock.now} />)
    clock.advance(3000)
    expect(live()).toBeEmptyDOMElement()
  })

  it('RNF-A11Y-03 / RD-MOT-03: sin movimiento, sin persiana, sin parpadeo y sin latido', () => {
    const clock = testClock(TARGET - 30 * MINUTE_MS)
    const { container } = render(<Countdown target={TARGET} now={clock.now} />)
    const separator = [...container.querySelectorAll('span')].find((el) => el.textContent === ':')!
    const digit = container.querySelector('[aria-hidden="true"] span span span')!
    const segments = container.querySelector('[aria-hidden="true"]')!
    const animation = (el: Element) => getComputedStyle(el).getPropertyValue('animation')
    expect(animation(separator)).toMatch(/blink/)
    expect(animation(digit)).toMatch(/blind/)
    // RNF-PERF-03: la persiana no se queda «en efecto» al terminar.
    expect(animation(digit)).toMatch(/\bbackwards$/)
    expect(animation(segments)).toMatch(/heartbeat/)
    document.documentElement.setAttribute('data-motion', 'reduced')
    expect(animation(separator)).toBe('none')
    expect(animation(digit)).toBe('none')
    expect(animation(segments)).toBe('none')
  })
})
