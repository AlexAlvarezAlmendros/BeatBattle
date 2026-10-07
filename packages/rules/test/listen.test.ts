import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { ENTRY_MAX_DURATION_MS, ENTRY_MIN_DURATION_MS, LISTEN_THRESHOLD_MS } from '../src/balance'
import { isListenThresholdMet, listenThresholdMs } from '../src/listen'

const MINUTE_MS = 60_000

describe('listenThresholdMs', () => {
  it('RF-VOTE-04 (parcial: umbral puro; el 409 LISTEN_REQUIRED llega en la Fase 5): 30 s en cualquier entrada válida (Anexo G: 3 min → 30 s; 4 min → 30 s)', () => {
    expect(listenThresholdMs(3 * MINUTE_MS)).toBe(30_000)
    expect(listenThresholdMs(ENTRY_MAX_DURATION_MS)).toBe(30_000)
    expect(listenThresholdMs(ENTRY_MIN_DURATION_MS)).toBe(30_000)
  })

  it('RF-VOTE-04 (parcial: umbral puro; el 409 LISTEN_REQUIRED llega en la Fase 5): en una entrada de 3 min, a los 20 s no se cumple y a los 31 s sí', () => {
    expect(isListenThresholdMet(20_000, 3 * MINUTE_MS)).toBe(false)
    expect(isListenThresholdMet(31_000, 3 * MINUTE_MS)).toBe(true)
  })

  it('RF-VOTE-04 (parcial: umbral puro; el 409 LISTEN_REQUIRED llega en la Fase 5): la frontera está incluida (30 000 ms cumple, 29 999 ms no)', () => {
    expect(isListenThresholdMet(30_000, 3 * MINUTE_MS)).toBe(true)
    expect(isListenThresholdMet(29_999, 3 * MINUTE_MS)).toBe(false)
  })

  it('una entrada más corta que el umbral se escucha entera (redondeada al milisegundo)', () => {
    expect(listenThresholdMs(20_000)).toBe(20_000)
    expect(listenThresholdMs(20_000.6)).toBe(20_001)
    expect(listenThresholdMs(0)).toBe(0)
  })

  it('nunca pasa de 30 s ni de la propia duración, y no baja al alargar la entrada', () => {
    fc.assert(
      fc.property(fc.nat(24 * 60 * MINUTE_MS), fc.nat(MINUTE_MS), (duration, extra) => {
        const threshold = listenThresholdMs(duration)
        expect(threshold).toBeLessThanOrEqual(LISTEN_THRESHOLD_MS)
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
