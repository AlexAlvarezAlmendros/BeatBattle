import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { ENTRY_MAX_DURATION_MS, ENTRY_MIN_DURATION_MS, LISTEN_END_TOLERANCE_MS } from '../src/balance'
import { isListenThresholdMet, listenThresholdMs } from '../src/listen'

const MINUTE_MS = 60_000

describe('listenThresholdMs', () => {
  it('RF-VOTE-04 (parcial: umbral puro; el 409 LISTEN_REQUIRED llega en la Fase 5): escucha entera menos 1 s (Anexo G: 3 min → 2:59; 60 s → 59 s)', () => {
    expect(listenThresholdMs(3 * MINUTE_MS)).toBe(179_000)
    expect(listenThresholdMs(60_000)).toBe(59_000)
    expect(listenThresholdMs(ENTRY_MAX_DURATION_MS)).toBe(239_000)
    expect(listenThresholdMs(ENTRY_MIN_DURATION_MS)).toBe(29_000)
  })

  it('RF-VOTE-04 (parcial: umbral puro; el 409 LISTEN_REQUIRED llega en la Fase 5): en una entrada de 3 min, a los 45 s no se cumple y a los 2:59 sí', () => {
    expect(isListenThresholdMet(45_000, 3 * MINUTE_MS)).toBe(false)
    expect(isListenThresholdMet(179_000, 3 * MINUTE_MS)).toBe(true)
    expect(isListenThresholdMet(3 * MINUTE_MS, 3 * MINUTE_MS)).toBe(true)
  })

  it('RF-VOTE-04 (parcial: umbral puro; el 409 LISTEN_REQUIRED llega en la Fase 5): la frontera está incluida (179 000 ms cumple, 178 999 ms no)', () => {
    expect(isListenThresholdMet(179_000, 3 * MINUTE_MS)).toBe(true)
    expect(isListenThresholdMet(178_999, 3 * MINUTE_MS)).toBe(false)
  })

  it('redondea duraciones fraccionarias al milisegundo y no baja de 0', () => {
    expect(listenThresholdMs(30_000.4)).toBe(29_000)
    expect(listenThresholdMs(30_000.6)).toBe(29_001)
    expect(listenThresholdMs(500)).toBe(0)
    expect(listenThresholdMs(0)).toBe(0)
  })

  it('pide toda la entrada salvo el margen, nunca más que la duración, y crece con ella', () => {
    fc.assert(
      fc.property(fc.nat(24 * 60 * MINUTE_MS), fc.nat(MINUTE_MS), (duration, extra) => {
        const threshold = listenThresholdMs(duration)
        expect(threshold).toBeLessThanOrEqual(duration)
        expect(threshold).toBeGreaterThanOrEqual(duration - LISTEN_END_TOLERANCE_MS)
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
