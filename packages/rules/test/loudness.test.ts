import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { TARGET_LOUDNESS_LUFS } from '../src/balance'
import { playbackGainDb } from '../src/loudness'

describe('playbackGainDb', () => {
  it('RF-PLAY-03: una entrada a −8 LUFS suena con −6 dB; una a −18 LUFS, a 0 dB', () => {
    expect(playbackGainDb(-8)).toBe(-6)
    expect(playbackGainDb(-18)).toBe(0)
  })

  it('RF-PLAY-03: en el objetivo no cambia nada', () => {
    expect(TARGET_LOUDNESS_LUFS).toBe(-14)
    expect(playbackGainDb(-14)).toBe(0)
  })

  it('RF-PLAY-03: solo atenúa (ganancia ≤ 0 dB)', () => {
    fc.assert(
      fc.property(fc.double({ min: -120, max: 20, noNaN: true }), (lufs) => {
        expect(playbackGainDb(lufs)).toBeLessThanOrEqual(0)
      }),
    )
  })

  it('lo que suena más fuerte que el objetivo queda justo en el objetivo', () => {
    fc.assert(
      fc.property(fc.double({ min: TARGET_LOUDNESS_LUFS, max: 20, noNaN: true }), (lufs) => {
        expect(lufs + playbackGainDb(lufs)).toBeCloseTo(TARGET_LOUDNESS_LUFS, 9)
      }),
    )
  })

  it('acepta otro objetivo', () => {
    expect(playbackGainDb(-10, -16)).toBe(-6)
  })

  it('el silencio digital (−∞ LUFS) suena a 0 dB; NaN y +∞ son errores de medición', () => {
    expect(playbackGainDb(Number.NEGATIVE_INFINITY)).toBe(0)
    expect(() => playbackGainDb(Number.NaN)).toThrow(RangeError)
    expect(() => playbackGainDb(Number.POSITIVE_INFINITY)).toThrow(RangeError)
    expect(() => playbackGainDb(-10, Number.NaN)).toThrow(RangeError)
  })
})
