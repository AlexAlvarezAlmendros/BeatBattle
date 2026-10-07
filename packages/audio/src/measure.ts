/**
 * Medidas de una pista para enseñarla y escucharla (guía §4.6, tarea 1.10). Puro: sin Web Audio, igual en
 * el navegador (vista previa de la subida) que en el servidor.
 *
 * - **Forma de onda**: mínimo y máximo por tramo, 1000 tramos, en `Int8` (±127). Es el formato que guarda
 *   la entrada y que pinta `Waveform` tras `waveformPeaks()`.
 * - **Sonoridad aproximada**: sonoridad integrada de BS.1770 (filtro K, bloques de 400 ms con puerta
 *   absoluta de −70 LUFS y relativa de −10 LU), para la vista previa de la subida. La medida que vale
 *   es la del servidor (§4.8).
 * - **Momento más enérgico**: la ventana de 6 s con más energía, para la ceremonia (§3.8.6).
 */

/** Tramos de la forma de onda (§4.6). */
export const WAVEFORM_BINS = 1000

/** Escala de un pico en `Int8`. */
const INT8_SCALE = 127

/**
 * Forma de onda: `bins` pares `[mín, máx]` intercalados (`[mín0, máx0, mín1, máx1, …]`), cada valor en
 * `[-127, 127]`. Cada tramo toma al menos una muestra: en una pista más corta que `bins` muestras, los
 * tramos repiten la muestra más cercana (como `resamplePeaks` en la web).
 */
export function waveform(pcm: Float32Array, bins: number = WAVEFORM_BINS): Int8Array {
  const out = new Int8Array(bins * 2)
  const n = pcm.length
  if (n === 0) return out
  for (let b = 0; b < bins; b++) {
    const start = Math.min(n - 1, Math.floor((b * n) / bins))
    const end = Math.max(start + 1, Math.floor(((b + 1) * n) / bins))
    let min = 1
    let max = -1
    for (let i = start; i < end && i < n; i++) {
      const v = pcm[i]!
      if (v < min) min = v
      if (v > max) max = v
    }
    out[b * 2] = Math.round(Math.max(-1, Math.min(1, min)) * INT8_SCALE)
    out[b * 2 + 1] = Math.round(Math.max(-1, Math.min(1, max)) * INT8_SCALE)
  }
  return out
}

/** La forma de onda en `Int8` como pares `[mín, máx]` en `[-1, 1]` (lo que pinta `Waveform`). */
export function waveformPeaks(data: Int8Array): [number, number][] {
  const peaks: [number, number][] = []
  for (let i = 0; i + 1 < data.length; i += 2) peaks.push([data[i]! / INT8_SCALE, data[i + 1]! / INT8_SCALE])
  return peaks
}

interface Biquad {
  b0: number
  b1: number
  b2: number
  a1: number
  a2: number
}

/**
 * Las dos etapas del filtro K de BS.1770 (estante alto + paso alto RLB) para cualquier frecuencia de
 * muestreo: con 48 kHz dan los coeficientes de la norma (cálculo de libebur128).
 */
export function kWeightingFilters(sampleRate: number): [Biquad, Biquad] {
  const shelfF0 = 1681.974450955533
  const shelfGain = 3.999843853973347
  const shelfQ = 0.7071752369554196
  let k = Math.tan((Math.PI * shelfF0) / sampleRate)
  const vh = 10 ** (shelfGain / 20)
  const vb = vh ** 0.4996667741545416
  let a0 = 1 + k / shelfQ + k * k
  const shelf: Biquad = {
    b0: (vh + (vb * k) / shelfQ + k * k) / a0,
    b1: (2 * (k * k - vh)) / a0,
    b2: (vh - (vb * k) / shelfQ + k * k) / a0,
    a1: (2 * (k * k - 1)) / a0,
    a2: (1 - k / shelfQ + k * k) / a0,
  }
  const passF0 = 38.13547087602444
  const passQ = 0.5003270373238773
  k = Math.tan((Math.PI * passF0) / sampleRate)
  a0 = 1 + k / passQ + k * k
  const highpass: Biquad = {
    b0: 1,
    b1: -2,
    b2: 1,
    a1: (2 * (k * k - 1)) / a0,
    a2: (1 - k / passQ + k * k) / a0,
  }
  return [shelf, highpass]
}

function applyBiquad(input: Float32Array, f: Biquad): Float32Array {
  const out = new Float32Array(input.length)
  let x1 = 0
  let x2 = 0
  let y1 = 0
  let y2 = 0
  for (let i = 0; i < input.length; i++) {
    const x = input[i]!
    const y = f.b0 * x + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2
    x2 = x1
    x1 = x
    y2 = y1
    y1 = y
    out[i] = y
  }
  return out
}

/** Sonoridad de un cuadrado medio (BS.1770): −0,691 + 10·log10(z). */
const lufs = (meanSquare: number) => -0.691 + 10 * Math.log10(meanSquare)

/** Puerta absoluta de BS.1770 (LUFS). */
const ABSOLUTE_GATE = -70

/**
 * Sonoridad integrada aproximada (LUFS) de una pista mono, según BS.1770: filtro K, bloques de 400 ms con
 * un 75 % de solape, puerta absoluta (−70 LUFS) y relativa (−10 LU). Sin bloques por encima de la puerta,
 * `-Infinity` (silencio).
 */
export function approximateLoudness(pcm: Float32Array, sampleRate: number): number {
  const [shelf, highpass] = kWeightingFilters(sampleRate)
  const weighted = applyBiquad(applyBiquad(pcm, shelf), highpass)
  const block = Math.round(0.4 * sampleRate)
  const step = Math.round(0.1 * sampleRate)
  if (weighted.length < block) return Number.NEGATIVE_INFINITY
  // Sumas prefijas de los cuadrados: cada bloque en O(1).
  const prefix = new Float64Array(weighted.length + 1)
  for (let i = 0; i < weighted.length; i++) prefix[i + 1] = prefix[i]! + weighted[i]! * weighted[i]!
  const blocks: number[] = []
  for (let start = 0; start + block <= weighted.length; start += step) {
    blocks.push((prefix[start + block]! - prefix[start]!) / block)
  }
  const aboveAbsolute = blocks.filter((z) => z > 0 && lufs(z) > ABSOLUTE_GATE)
  if (aboveAbsolute.length === 0) return Number.NEGATIVE_INFINITY
  const relativeGate = lufs(aboveAbsolute.reduce((sum, z) => sum + z, 0) / aboveAbsolute.length) - 10
  const gated = aboveAbsolute.filter((z) => lufs(z) > relativeGate)
  return lufs(gated.reduce((sum, z) => sum + z, 0) / gated.length)
}

/** Ventana del momento más enérgico (s, §4.6). */
export const ENERGETIC_WINDOW_SECONDS = 6

/** Paso de la búsqueda (s). */
const ENERGETIC_STEP_SECONDS = 0.25

/**
 * La ventana de `windowSeconds` (6 s) con más energía (cuadrado medio): su comienzo y su final en segundos.
 * Si la pista es más corta que la ventana, la pista entera.
 */
export function mostEnergeticMoment(
  pcm: Float32Array,
  sampleRate: number,
  windowSeconds: number = ENERGETIC_WINDOW_SECONDS,
): { start: number; end: number } {
  const duration = pcm.length / sampleRate
  const window = Math.round(windowSeconds * sampleRate)
  if (pcm.length <= window) return { start: 0, end: duration }
  const prefix = new Float64Array(pcm.length + 1)
  for (let i = 0; i < pcm.length; i++) prefix[i + 1] = prefix[i]! + pcm[i]! * pcm[i]!
  const step = Math.max(1, Math.round(ENERGETIC_STEP_SECONDS * sampleRate))
  let best = 0
  let bestEnergy = -1
  for (let start = 0; start + window <= pcm.length; start += step) {
    const energy = prefix[start + window]! - prefix[start]!
    if (energy > bestEnergy) {
      bestEnergy = energy
      best = start
    }
  }
  return { start: best / sampleRate, end: (best + window) / sampleRate }
}
