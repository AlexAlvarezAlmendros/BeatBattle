/**
 * Teoría mínima para afinar los efectos (guía §3.7.1): todos los efectos tonales van en la tonalidad del
 * sample de la semana (por defecto, La menor) y las estrellas, el XP y los combos tocan notas de su escala
 * pentatónica (`RD-SND-04`). Puro: sin Web Audio.
 */

/** Clases de altura (0 = Do … 11 = Si). */
export type PitchClass = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11

export interface Key {
  tonic: PitchClass
  mode: 'major' | 'minor'
}

/** La menor: la tonalidad por defecto cuando la semana no tiene una (§3.7.1). */
export const DEFAULT_KEY: Key = { tonic: 9, mode: 'minor' }

/** Semitonos de la pentatónica sobre la tónica: menor (1 ♭3 4 5 ♭7) y mayor (1 2 3 5 6). */
const PENTATONIC: Record<Key['mode'], readonly number[]> = {
  minor: [0, 3, 5, 7, 10],
  major: [0, 2, 4, 7, 9],
}

/** Tríada de la tónica (semitonos): menor o mayor. */
const TRIAD: Record<Key['mode'], readonly number[]> = {
  minor: [0, 3, 7],
  major: [0, 4, 7],
}

/** Frecuencia de una nota MIDI (La4 = 69 = 440 Hz). */
export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12)
}

/** Nota MIDI de la tónica en la octava 4 (Do4 = 60). */
export function tonicMidi(key: Key, octave = 4): number {
  return 12 * (octave + 1) + key.tonic
}

/**
 * Grado `degree` (1, 2, 3…) de la pentatónica de la tonalidad, desde la tónica de la octava `octave`;
 * pasado el 5.º sigue en la octava siguiente.
 */
export function pentatonicMidi(key: Key, degree: number, octave = 4): number {
  const steps = PENTATONIC[key.mode]
  const index = degree - 1
  const wrap = Math.floor(index / steps.length)
  const step = steps[((index % steps.length) + steps.length) % steps.length] ?? 0
  return tonicMidi(key, octave) + 12 * wrap + step
}

export function pentatonicHz(key: Key, degree: number, octave = 4): number {
  return midiToHz(pentatonicMidi(key, degree, octave))
}

/** Tríada de la tónica en Hz (para los acordes de recompensa). */
export function tonicTriadHz(key: Key, octave = 4): number[] {
  return TRIAD[key.mode].map((step) => midiToHz(tonicMidi(key, octave) + step))
}
