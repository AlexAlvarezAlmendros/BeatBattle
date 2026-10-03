import { afterEach, describe, expect, it } from 'vitest'
import { setSeriousMode } from '../hooks/useSeriousMode'
import { createFlashLimiter, FLASH_LIMITS, flash } from './flash'

/** Reloj manual en ms. */
function clock(start = 0) {
  let now = start
  return { now: () => now, advance: (ms: number) => (now += ms) }
}

afterEach(() => {
  document.documentElement.removeAttribute('data-serious')
  flash.reset()
})

describe('flash.request() — limitador de destellos (RD-MOT-04, RNF-A11Y-04)', () => {
  it('RD-MOT-04: autoriza como mucho 3 destellos en cualquier ventana de 1 s', () => {
    const time = clock()
    const limiter = createFlashLimiter({ now: time.now, suppressed: () => false })
    expect(limiter.request({ reason: 'vote' })).not.toBeNull()
    time.advance(100)
    expect(limiter.request({ reason: 'vote' })).not.toBeNull()
    time.advance(100)
    expect(limiter.request({ reason: 'combo' })).not.toBeNull()
    time.advance(100)
    expect(limiter.request({ reason: 'vote' })).toBeNull()
    expect(limiter.recent()).toBe(3)
    // El primero sale de la ventana a los 1000 ms justos: vuelve a haber hueco para uno.
    time.advance(700)
    expect(limiter.request({ reason: 'vote' })).not.toBeNull()
    expect(limiter.request({ reason: 'vote' })).toBeNull()
  })

  it('RD-MOT-04: nunca más de 3 en ningún segundo, con peticiones a cualquier ritmo', () => {
    const time = clock()
    const limiter = createFlashLimiter({ now: time.now, suppressed: () => false })
    const granted: number[] = []
    for (let i = 0; i < 400; i += 1) {
      if (limiter.request({ reason: 'ceremony' })) granted.push(time.now())
      time.advance(1 + ((i * 37) % 90))
    }
    for (const start of granted) {
      expect(
        granted.filter((at) => at >= start && at < start + FLASH_LIMITS.windowMs).length,
      ).toBeLessThanOrEqual(3)
    }
    expect(granted.length).toBeGreaterThan(10)
  })

  it('RD-MOT-04: ≤ 25 % del área y ≤ 40 % de opacidad: nunca rojo saturado a pantalla completa', () => {
    const limiter = createFlashLimiter({ now: () => 0, suppressed: () => false })
    expect(limiter.request({ reason: 'vote', area: 1, opacity: 1 })).toEqual({
      reason: 'vote',
      area: 0.25,
      opacity: 0.4,
    })
    expect(limiter.request({ reason: 'xp', area: 0.1, opacity: 0.2 })).toEqual({
      reason: 'xp',
      area: 0.1,
      opacity: 0.2,
    })
    expect(limiter.request({ reason: 'xp', area: Number.NaN, opacity: -1 })).toEqual({
      reason: 'xp',
      area: 0,
      opacity: 0,
    })
    expect(FLASH_LIMITS).toEqual({ perWindow: 3, windowMs: 1000, maxArea: 0.25, maxOpacity: 0.4 })
  })

  it('RD-MOT-04: en modo serio no se autoriza ninguno (el limitador de la app mira <html data-serious>)', () => {
    expect(flash.request({ reason: 'achievement' })).not.toBeNull()
    setSeriousMode(true)
    expect(flash.request({ reason: 'achievement' })).toBeNull()
    setSeriousMode(false)
    expect(flash.request({ reason: 'achievement' })).not.toBeNull()
  })

  it('reset() olvida el historial', () => {
    const limiter = createFlashLimiter({ now: () => 0, suppressed: () => false })
    for (let i = 0; i < 3; i += 1) limiter.request({ reason: 'vote' })
    expect(limiter.request({ reason: 'vote' })).toBeNull()
    limiter.reset()
    expect(limiter.request({ reason: 'vote' })).not.toBeNull()
  })
})
