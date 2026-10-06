import { describe, expect, it } from 'vitest'
import {
  approximateLoudness,
  kWeightingFilters,
  mostEnergeticMoment,
  WAVEFORM_BINS,
  waveform,
  waveformPeaks,
} from '../src/measure'

const sine = (hz: number, amplitude: number, seconds: number, sampleRate: number) => {
  const pcm = new Float32Array(Math.round(seconds * sampleRate))
  for (let i = 0; i < pcm.length; i++) pcm[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / sampleRate)
  return pcm
}

const db = (amplitude: number) => 20 * Math.log10(amplitude)

describe('forma de onda (§4.6, 1.10)', () => {
  it('1000 tramos de [mín, máx] en Int8', () => {
    const data = waveform(sine(440, 0.5, 5, 22_050))
    expect(data).toBeInstanceOf(Int8Array)
    expect(data.length).toBe(WAVEFORM_BINS * 2)
    for (let i = 0; i < data.length; i += 2) expect(data[i]).toBeLessThanOrEqual(data[i + 1] as number)
    // Un seno de amplitud 0,5 llega a ±63,5 (0,5 × 127); muestreado, el pico queda en 63 o 64.
    expect(Math.max(...data)).toBeGreaterThanOrEqual(63)
    expect(Math.max(...data)).toBeLessThanOrEqual(64)
    expect(Math.min(...data)).toBeLessThanOrEqual(-63)
  })

  it('sigue la envolvente: silencio, golpe y silencio', () => {
    const pcm = new Float32Array(10_000)
    for (let i = 4_000; i < 5_000; i++) pcm[i] = i % 2 === 0 ? 0.9 : -0.9
    const peaks = waveformPeaks(waveform(pcm, 10))
    expect(peaks).toHaveLength(10)
    expect(peaks[0]).toEqual([0, 0])
    expect(peaks[4]?.[1]).toBeCloseTo(0.9, 1)
    expect(peaks[9]).toEqual([0, 0])
  })

  it('recorta lo que pasa de ±1 y aguanta pistas más cortas que los tramos', () => {
    expect(waveform(new Float32Array([2, -3]), 4)).toEqual(
      new Int8Array([2 * 0 + 127, 127, 127, 127, -127, -127, -127, -127]),
    )
    expect(waveform(new Float32Array(0), 3)).toEqual(new Int8Array(6))
  })
})

describe('sonoridad aproximada, BS.1770 (§4.6, 1.10)', () => {
  it('a 48 kHz, el filtro K da los coeficientes de la norma', () => {
    const [shelf, highpass] = kWeightingFilters(48_000)
    expect(shelf.b0).toBeCloseTo(1.53512485958697, 10)
    expect(shelf.b1).toBeCloseTo(-2.69169618940638, 10)
    expect(shelf.b2).toBeCloseTo(1.19839281085285, 10)
    expect(shelf.a1).toBeCloseTo(-1.69065929318241, 10)
    expect(shelf.a2).toBeCloseTo(0.73248077421585, 10)
    expect(highpass.a1).toBeCloseTo(-1.99004745483398, 10)
    expect(highpass.a2).toBeCloseTo(0.99007225036621, 10)
  })

  for (const sampleRate of [48_000, 44_100, 22_050]) {
    it(`un seno de 1 kHz de amplitud A mide 20·log10(A) − 3,01 LUFS (±0,2) a ${sampleRate} Hz`, () => {
      for (const amplitude of [1, 0.5, 0.1]) {
        const loudness = approximateLoudness(sine(997, amplitude, 5, sampleRate), sampleRate)
        expect(Math.abs(loudness - (db(amplitude) - 3.01))).toBeLessThanOrEqual(0.2)
      }
    })
  }

  it('la puerta deja fuera el silencio: con 10 s de silencio delante, la misma sonoridad', () => {
    const sampleRate = 22_050
    const tone = sine(997, 0.5, 5, sampleRate)
    const withSilence = new Float32Array(tone.length + 10 * sampleRate)
    withSilence.set(tone, 10 * sampleRate)
    // Los bloques a caballo entre el silencio y el tono pasan las puertas y bajan un poco la media (BS.1770).
    const difference = approximateLoudness(withSilence, sampleRate) - approximateLoudness(tone, sampleRate)
    expect(Math.abs(difference)).toBeLessThanOrEqual(0.25)
  })

  it('el silencio no tiene sonoridad', () => {
    expect(approximateLoudness(new Float32Array(48_000), 48_000)).toBe(Number.NEGATIVE_INFINITY)
  })
})

describe('momento más enérgico (§4.6, §3.8.6, 1.10)', () => {
  it('encuentra el golpe de 6 s en una pista tranquila', () => {
    const sampleRate = 8_000
    const pcm = sine(220, 0.05, 60, sampleRate)
    for (let i = 30 * sampleRate; i < 36 * sampleRate; i++)
      pcm[i] = 0.8 * Math.sin((2 * Math.PI * 220 * i) / sampleRate)
    const { start, end } = mostEnergeticMoment(pcm, sampleRate)
    expect(start).toBeCloseTo(30, 0)
    expect(end - start).toBeCloseTo(6, 5)
  })

  it('una pista más corta que la ventana es su propio momento', () => {
    expect(mostEnergeticMoment(new Float32Array(4 * 1000), 1000)).toEqual({ start: 0, end: 4 })
  })
})
