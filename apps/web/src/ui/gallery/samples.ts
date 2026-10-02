import { createRng } from '@beatbattle/rules'
import type { WaveformPeak } from '../Waveform'

/**
 * Picos de muestra para la galería, deterministas (la misma semilla da siempre la misma onda, así las
 * capturas se pueden comparar): frases de 4 compases con golpes en los tiempos fuertes.
 */
export function samplePeaks(seed: string, count = 180): WaveformPeak[] {
  const rng = createRng(seed)
  return Array.from({ length: count }, (_, i) => {
    const phrase = 0.4 + 0.6 * Math.abs(Math.sin((i / count) * Math.PI * 3))
    const beat = i % 8 < 2 ? 1 : 0.68
    const amplitude = Math.min(1, 0.15 + 0.85 * phrase * beat * (0.6 + 0.4 * rng.next()))
    return [-amplitude * (0.8 + 0.2 * rng.next()), amplitude]
  })
}

/** «Ahora» fijo de las cuentas atrás quietas de la galería: lunes 5 de octubre de 2026, 12:00 (Madrid). */
export const GALLERY_NOW = Date.UTC(2026, 9, 5, 10, 0, 0)
