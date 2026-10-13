import { color } from '@beatbattle/shared/tokens'
import { encodePng } from './png'

/**
 * La forma de onda del recibo (§2.12.1, §4.19.5; tarea 4.12): la onda **medida** de la entrada (los 1000
 * tramos `[mín, máx]` en `Int8` de `measureAudio`) en barras, como la onda de la interfaz, sobre el fondo de
 * la tarjeta del email. Las barras que tocan el máximo digital (±127) van en rojo: se ve dónde clipa.
 * Sin onda (todavía en `processing`, o una entrada que ya no existe), la línea plana.
 */

export const WAVEFORM_PNG_WIDTH = 512
export const WAVEFORM_PNG_HEIGHT = 96

/** Ancho de cada barra y su separación, en px (128 barras en 512). */
const BAR = 3
const STEP = 4
/** Altura mínima de una barra (el silencio sigue viéndose como línea). */
const MIN_BAR = 2
/** A partir de aquí (de 127) la barra se pinta como clip. */
const CLIP_LEVEL = 126

const BACKGROUND = 0
const BAR_INK = 1
const CLIP_INK = 2
const PALETTE = [color.panel, color.text2, color.red] as const

/** Amplitud (0–127) de cada barra a partir de los tramos `[mín, máx]`. */
function barLevels(peaks: Int8Array | null, bars: number): number[] {
  const bins = peaks ? Math.floor(peaks.length / 2) : 0
  return Array.from({ length: bars }, (_, bar) => {
    if (bins === 0 || !peaks) return 0
    const from = Math.floor((bar * bins) / bars)
    const to = Math.max(from + 1, Math.floor(((bar + 1) * bins) / bars))
    let level = 0
    for (let bin = from; bin < to && bin < bins; bin++) {
      level = Math.max(level, Math.abs(peaks[bin * 2] as number), Math.abs(peaks[bin * 2 + 1] as number))
    }
    return Math.min(127, level)
  })
}

/** El PNG de la onda (512 × 96). */
export function waveformPng(peaks: Int8Array | null): Uint8Array {
  const width = WAVEFORM_PNG_WIDTH
  const height = WAVEFORM_PNG_HEIGHT
  const pixels = new Uint8Array(width * height).fill(BACKGROUND)
  const bars = Math.floor(width / STEP)
  const levels = barLevels(peaks, bars)
  const middle = height / 2
  levels.forEach((level, bar) => {
    const half = Math.max(MIN_BAR / 2, (level / 127) * (middle - 2))
    const top = Math.round(middle - half)
    const bottom = Math.round(middle + half)
    const ink = level >= CLIP_LEVEL ? CLIP_INK : BAR_INK
    const left = bar * STEP + Math.floor((STEP - BAR) / 2)
    for (let y = top; y < bottom; y++) for (let x = left; x < left + BAR; x++) pixels[y * width + x] = ink
  })
  return encodePng({ width, height, palette: PALETTE, pixels })
}
