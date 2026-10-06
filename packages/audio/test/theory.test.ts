import { describe, expect, it } from 'vitest'
import { DEFAULT_KEY, midiToHz, pentatonicHz, pentatonicMidi, tonicTriadHz } from '../src/theory'

const C_MINOR = { tonic: 0, mode: 'minor' } as const

describe('teoría para afinar los efectos (§3.7.1)', () => {
  it('la tonalidad por defecto es La menor', () => {
    expect(DEFAULT_KEY).toEqual({ tonic: 9, mode: 'minor' })
  })

  it('RD-SND-04: con la semana en Do menor, el grado 1 de la pentatónica es Do y el 5.º es Si♭', () => {
    expect(pentatonicMidi(C_MINOR, 1) % 12).toBe(0)
    expect(pentatonicMidi(C_MINOR, 5) % 12).toBe(10)
    // Ascendente: cada grado más agudo que el anterior.
    const degrees = [1, 2, 3, 4, 5].map((degree) => pentatonicHz(C_MINOR, degree))
    for (let i = 1; i < degrees.length; i++) expect(degrees[i]).toBeGreaterThan(degrees[i - 1] as number)
  })

  it('pasado el 5.º grado, la pentatónica sigue en la octava siguiente', () => {
    expect(pentatonicMidi(DEFAULT_KEY, 6)).toBe(pentatonicMidi(DEFAULT_KEY, 1) + 12)
  })

  it('La4 = 440 Hz y la tríada de La menor es La, Do y Mi', () => {
    expect(midiToHz(69)).toBeCloseTo(440)
    const [a, c, e] = tonicTriadHz(DEFAULT_KEY, 4)
    expect(a).toBeCloseTo(440)
    expect(c).toBeCloseTo(523.25, 1)
    expect(e).toBeCloseTo(659.26, 1)
  })
})
