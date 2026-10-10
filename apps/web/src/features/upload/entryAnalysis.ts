import { MUSICAL_KEYS, type MusicalKey, TONICS } from '@beatbattle/shared'
import type { WaveformPeak } from '../../ui/Waveform'

/** Tramos de la onda que se dibuja al analizar (los mismos que mide el servidor, §4.8.4). */
export const ANALYSIS_PEAK_BINS = 1000

/** Nombres de nota del motor de análisis (bemoles donde es costumbre), por clase de altura. */
const ENGINE_NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const

/**
 * La onda de un audio decodificado en mono: `bins` tramos `[mín, máx]` en `[-1, 1]`, como `WaveformPeak`.
 * Un audio más corto que `bins` muestras da un tramo por muestra.
 */
export function peaksOf(pcm: Float32Array, bins = ANALYSIS_PEAK_BINS): WaveformPeak[] {
  const count = Math.min(bins, pcm.length)
  const peaks: WaveformPeak[] = []
  for (let b = 0; b < count; b++) {
    const start = Math.floor((b * pcm.length) / count)
    const end = Math.max(start + 1, Math.floor(((b + 1) * pcm.length) / count))
    let min = 0
    let max = 0
    for (let i = start; i < end; i++) {
      const value = pcm[i] as number
      if (value < min) min = value
      if (value > max) max = value
    }
    peaks.push([Math.max(-1, min), Math.min(1, max)])
  }
  return peaks
}

/**
 * La tonalidad del análisis local («Bb» + `minor`) en la notación de la ficha (`A#m`, §2.5): el motor
 * escribe bemoles como los productores; la API, sostenidos. `null` si no la reconoce.
 */
export function musicalKeyOf(key: string, mode: 'major' | 'minor'): MusicalKey | null {
  const index = (ENGINE_NOTES as readonly string[]).indexOf(key)
  const sharp = index >= 0 ? TONICS[index] : (TONICS as readonly string[]).includes(key) ? key : null
  if (!sharp) return null
  const candidate = `${sharp}${mode === 'minor' ? 'm' : ''}`
  return (MUSICAL_KEYS as readonly string[]).includes(candidate) ? (candidate as MusicalKey) : null
}

/** El BPM sugerido para la ficha: entero, dentro de lo que admite (40–250), o `null`. */
export function suggestedBpm(bpm: number): number | null {
  if (!Number.isFinite(bpm)) return null
  const rounded = Math.round(bpm)
  return rounded >= 40 && rounded <= 250 ? rounded : null
}
