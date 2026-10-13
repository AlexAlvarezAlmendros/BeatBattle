import { describe, expect, it } from 'vitest'
import { measureAudio, WAVEFORM_BINS, waveformPeaks } from '../src/media/measure'
import { sineWav } from './fixtures/wav'

describe('measureAudio (ffmpeg)', () => {
  it('RF-STO-04: un seno a −10 LUFS se mide entre −10,5 y −9,5, con su duración y su onda', async () => {
    const result = await measureAudio(sineWav({ seconds: 12 }))
    expect(result.integratedLufs).toBeGreaterThanOrEqual(-10.5)
    expect(result.integratedLufs).toBeLessThanOrEqual(-9.5)
    expect(result.truePeakDb).toBeGreaterThan(-10.5)
    expect(result.truePeakDb).toBeLessThan(-9.5)
    expect(result.durationMs).toBe(12_000)
    expect(result.peaks).toHaveLength(WAVEFORM_BINS * 2)
    // Amplitud 0,316 → ±40 de 127 en cada tramo.
    expect(Math.max(...result.peaks)).toBeGreaterThanOrEqual(38)
    expect(Math.min(...result.peaks)).toBeLessThanOrEqual(-38)
  })

  it('lo que no es audio falla, sin colgar el proceso', async () => {
    await expect(measureAudio(new TextEncoder().encode('esto no es un wav'))).rejects.toThrow()
  })
})

describe('waveformPeaks', () => {
  it('mínimo y máximo de cada tramo, en Int8', () => {
    const samples = new Int16Array([0, 32767, -32768, 0, 16384, -16384, 0, 0])
    expect(Array.from(waveformPeaks(samples, 4))).toEqual([0, 127, -127, 0, -63, 64, 0, 0])
  })
})
