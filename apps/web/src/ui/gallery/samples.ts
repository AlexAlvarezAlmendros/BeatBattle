import type { WaveformPeak } from '../Waveform'

/** Hash FNV-1a de 32 bits (el `hash()` de `final.js` de las maquetas). */
function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** PRNG con semilla (el `rng()` de `final.js`, *mulberry32*): la misma semilla, la misma secuencia. */
function mockupRng(seed: string): () => number {
  let a = hash(seed)
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/**
 * Picos de muestra para la galería y el menú de desarrollo, deterministas (la misma semilla da siempre
 * la misma onda, así las capturas se pueden comparar). Es la onda de las maquetas aprobadas
 * (`final.js`: `waveData()` y el detalle de `wave()`), sin cambiar la lógica: tres senos con fase de
 * la semilla dan la envolvente por secciones (con pasajes casi en silencio) y cada barra lleva su
 * detalle; mínimo 0,08, como en la maqueta. Con `sample-41` sale la onda de `01-menu.html`.
 */
export function samplePeaks(seed: string, count = 96): WaveformPeak[] {
  const random = mockupRng(`${seed}:wave`)
  const f = [1 + random() * 2, 3 + random() * 5, 9 + random() * 9] as const
  const p = [random() * Math.PI * 2, random() * Math.PI * 2, random() * Math.PI * 2] as const
  const envelope: number[] = []
  for (let i = 0; i < count; i += 1) {
    const u = i / count
    let v =
      0.55 * Math.sin(u * Math.PI * 2 * f[0] + p[0]) +
      0.3 * Math.sin(u * Math.PI * 2 * f[1] + p[1]) +
      0.2 * Math.sin(u * Math.PI * 2 * f[2] + p[2])
    v = 0.5 + 0.5 * v
    v = v * 0.75 + random() * 0.25
    envelope.push(clamp(v, 0.06, 1))
  }
  const detail = mockupRng(`${seed}:detail`)
  return envelope.map((value) => {
    const amplitude = clamp(value * (0.55 + detail() * 0.45), 0.08, 1)
    return [-amplitude, amplitude]
  })
}

/** «Ahora» fijo de las cuentas atrás quietas de la galería: lunes 5 de octubre de 2026, 12:00 (Madrid). */
export const GALLERY_NOW = Date.UTC(2026, 9, 5, 10, 0, 0)
