import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { ENTRY_MAX_DURATION_MS, ENTRY_MIN_DURATION_MS, LISTEN_THRESHOLD_MAX_MS } from '../src/balance'
import { isListenThresholdMet, listenThresholdMs } from '../src/listen'

const MINUTE_MS = 60_000

describe('listenThresholdMs', () => {
  it('RF-VOTE-04 (parcial: umbral puro; el 409 LISTEN_REQUIRED llega en la Fase 5): casos del Anexo G (3 min → 45 s; 60 s → 30 s)', () => {
    expect(listenThresholdMs(3 * MINUTE_MS)).toBe(45_000)
    expect(listenThresholdMs(60_000)).toBe(30_000)
  })

  it('RF-VOTE-04 (parcial: umbral puro; el 409 LISTEN_REQUIRED llega en la Fase 5): en una entrada de 3 min, a los 20 s no se cumple y a los 46 s sí', () => {
    expect(isListenThresholdMet(20_000, 3 * MINUTE_MS)).toBe(false)
    expect(isListenThresholdMet(46_000, 3 * MINUTE_MS)).toBe(true)
  })

  it('RF-VOTE-04 (parcial: umbral puro; el 409 LISTEN_REQUIRED llega en la Fase 5): la frontera está incluida (45 000 ms cumple, 44 999 ms no)', () => {
    expect(isListenThresholdMet(45_000, 3 * MINUTE_MS)).toBe(true)
    expect(isListenThresholdMet(44_999, 3 * MINUTE_MS)).toBe(false)
  })

  it('redondea la mitad de una duración impar (Anexo G: round(duracionMs / 2))', () => {
    expect(listenThresholdMs(30_001)).toBe(15_001)
    expect(listenThresholdMs(30_000)).toBe(15_000)
  })

  it('la mitad manda hasta 90 s y el tope de 45 s a partir de ahí', () => {
    expect(listenThresholdMs(89_998)).toBe(44_999)
    expect(listenThresholdMs(90_000)).toBe(45_000)
    expect(listenThresholdMs(ENTRY_MAX_DURATION_MS)).toBe(45_000)
    expect(listenThresholdMs(ENTRY_MIN_DURATION_MS)).toBe(15_000)
  })

  it('nunca supera el tope ni la propia duración, y no baja al alargar la entrada', () => {
    fc.assert(
      fc.property(fc.nat(24 * 60 * MINUTE_MS), fc.nat(MINUTE_MS), (duration, extra) => {
        const threshold = listenThresholdMs(duration)
        expect(threshold).toBeLessThanOrEqual(LISTEN_THRESHOLD_MAX_MS)
        expect(threshold).toBeLessThanOrEqual(duration)
        expect(Number.isInteger(threshold)).toBe(true)
        expect(listenThresholdMs(duration + extra)).toBeGreaterThanOrEqual(threshold)
      }),
    )
  })

  it('rechaza duraciones y escuchas imposibles', () => {
    expect(() => listenThresholdMs(-1)).toThrow(RangeError)
    expect(() => listenThresholdMs(Number.NaN)).toThrow(RangeError)
    expect(() => listenThresholdMs(Number.POSITIVE_INFINITY)).toThrow(RangeError)
    expect(() => isListenThresholdMet(-1, MINUTE_MS)).toThrow(RangeError)
    expect(() => isListenThresholdMet(Number.NaN, MINUTE_MS)).toThrow(RangeError)
  })
})
