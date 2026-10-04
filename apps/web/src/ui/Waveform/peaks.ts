/**
 * Picos de una forma de onda: pares `[mín, máx]` en `[-1, 1]` por tramo de audio, como los que mide el
 * servidor (§4.8.4) y guarda con la entrada.
 */
export type WaveformPeak = readonly [min: number, max: number]

/** Ancho de barra y hueco en píxeles CSS (§3.3: «barras de 3 px con 2 px de hueco»). */
export const WAVE_BAR_WIDTH = 3
export const WAVE_BAR_GAP = 2
export const WAVE_BAR_STEP = WAVE_BAR_WIDTH + WAVE_BAR_GAP

/** Cuántas barras caben en un ancho: `n` barras ocupan `5n − 2` px. Al menos una. */
export function barsForWidth(width: number): number {
  return Math.max(1, Math.floor((width + WAVE_BAR_GAP) / WAVE_BAR_STEP))
}

/**
 * Reparte los picos en `count` barras: al reducir, cada barra se queda con el mínimo y el máximo de
 * su tramo (no se pierden los transitorios); al ampliar, repite el pico más cercano. Los valores
 * fuera de `[-1, 1]` se recortan y una barra nunca queda con `mín > máx`.
 */
export function resamplePeaks(peaks: readonly WaveformPeak[], count: number): WaveformPeak[] {
  const n = Math.max(0, Math.floor(count))
  if (n === 0 || peaks.length === 0) return []
  const out: WaveformPeak[] = []
  for (let i = 0; i < n; i++) {
    const start = Math.floor((i * peaks.length) / n)
    const end = Math.max(start + 1, Math.floor(((i + 1) * peaks.length) / n))
    let min = 1
    let max = -1
    for (let j = start; j < end && j < peaks.length; j++) {
      const [lo, hi] = peaks[j]!
      min = Math.min(min, lo, hi)
      max = Math.max(max, lo, hi)
    }
    out.push([clamp(min), clamp(max)])
  }
  return out
}

/** Barras ya reproducidas para un progreso en `[0, 1]`. */
export function playedBars(count: number, progress: number): number {
  return Math.round(count * clamp01(progress))
}

const clamp = (value: number) => Math.min(1, Math.max(-1, value))
export const clamp01 = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0)
