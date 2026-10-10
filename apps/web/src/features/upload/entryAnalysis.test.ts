import { describe, expect, it } from 'vitest'
import { musicalKeyOf, peaksOf, suggestedBpm } from './entryAnalysis'

describe('entryAnalysis (§2.5)', () => {
  it('RF-ENT-06: la tonalidad del motor pasa a la notación de la ficha (140 BPM en La menor → 140 y Am)', () => {
    expect(musicalKeyOf('A', 'minor')).toBe('Am')
    expect(musicalKeyOf('Bb', 'minor')).toBe('A#m')
    expect(musicalKeyOf('Eb', 'major')).toBe('D#')
    expect(musicalKeyOf('F#', 'major')).toBe('F#')
    expect(musicalKeyOf('H', 'major')).toBeNull()
    expect(suggestedBpm(139.6)).toBe(140)
    expect(suggestedBpm(30)).toBeNull()
    expect(suggestedBpm(Number.NaN)).toBeNull()
  })

  it('la onda: 1000 tramos [mín, máx] de izquierda a derecha', () => {
    const pcm = new Float32Array(10_000)
    for (let i = 0; i < pcm.length; i++) pcm[i] = i < 5000 ? 0.5 * Math.sin(i) : 0
    const peaks = peaksOf(pcm)
    expect(peaks).toHaveLength(1000)
    expect(peaks[0]?.[1]).toBeGreaterThan(0.4)
    expect(peaks[0]?.[0]).toBeLessThan(-0.4)
    expect(peaks[999]).toEqual([0, 0])
    expect(peaksOf(new Float32Array([0.2, -0.3]))).toEqual([
      [0, expect.closeTo(0.2, 5)],
      [expect.closeTo(-0.3, 5), 0],
    ])
  })
})
