/**
 * Teoría para nombrar lo que detecta el motor (guía §4.6, tarea 1.9): nombres de nota, rueda Camelot,
 * Open Key y reglas de presentación del BPM. Port de `ReactOtpWeb/frontend/src/utils/musicTheory.js`.
 */

/** Nombres de las notas como los escriben DJ y productores (bemoles donde es costumbre). Índice = clase de altura. */
export const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const

export const MODE_MAJOR = 'major'
export const MODE_MINOR = 'minor'
export type Mode = typeof MODE_MAJOR | typeof MODE_MINOR

export interface KeyRef {
  pitchClass: number
  mode: Mode
}

// Rueda Camelot, el estándar de los DJ para mezclar en armonía: 8B = Do mayor, 8A = La menor; una
// quinta (+7 semitonos) = +1 en la rueda.
const CAMELOT_MAJOR = new Array<string>(12)
const CAMELOT_MINOR = new Array<string>(12)
for (let step = 0; step < 12; step++) {
  const num = ((8 + step - 1) % 12) + 1
  CAMELOT_MAJOR[(0 + 7 * step) % 12] = `${num}B`
  CAMELOT_MINOR[(9 + 7 * step) % 12] = `${num}A`
}

const wrap12 = (pitchClass: number) => ((pitchClass % 12) + 12) % 12

export function toCamelot(pitchClass: number, mode: Mode): string {
  const pc = wrap12(pitchClass)
  return (mode === MODE_MAJOR ? CAMELOT_MAJOR[pc] : CAMELOT_MINOR[pc]) ?? ''
}

/** Notación Open Key (Traktor): la misma rueda, 1d = Do mayor, 1m = La menor. */
export function toOpenKey(pitchClass: number, mode: Mode): string {
  const num = Number.parseInt(toCamelot(pitchClass, mode), 10)
  const openNum = ((num + 5 - 1) % 12) + 1
  return `${openNum}${mode === MODE_MAJOR ? 'd' : 'm'}`
}

export function keyLabel(pitchClass: number, mode: Mode): { note: string; mode: Mode } {
  return { note: NOTE_NAMES[wrap12(pitchClass)] ?? '—', mode }
}

/** Relativa mayor o menor (misma armadura). */
export function relativeKey(pitchClass: number, mode: Mode): KeyRef {
  const pc = wrap12(pitchClass)
  return mode === MODE_MAJOR
    ? { pitchClass: (pc + 9) % 12, mode: MODE_MINOR }
    : { pitchClass: (pc + 3) % 12, mode: MODE_MAJOR }
}

export type KeyRelationship = 'same' | 'relative' | 'fifth' | 'parallel' | 'other'

/** Relación musical entre dos tonalidades, para explicar las alternativas. */
export function keyRelationship(a: KeyRef, b: KeyRef): KeyRelationship {
  if (a.mode === b.mode && a.pitchClass === b.pitchClass) return 'same'
  const rel = relativeKey(a.pitchClass, a.mode)
  if (rel.pitchClass === b.pitchClass && rel.mode === b.mode) return 'relative'
  if (a.mode === b.mode) {
    const d = wrap12(b.pitchClass - a.pitchClass)
    if (d === 7 || d === 5) return 'fifth'
  }
  if (a.mode !== b.mode && a.pitchClass === b.pitchClass) return 'parallel'
  return 'other'
}

/**
 * La música producida va casi siempre a BPM entero (o de medio en medio): se redondea si está cerca y,
 * si no, se deja con un decimal para que los tempos raros sigan siendo honestos.
 */
export function snapBpm(bpm: number): { value: number; display: string } {
  if (!Number.isFinite(bpm) || bpm <= 0) return { value: 0, display: '—' }
  const nearestInt = Math.round(bpm)
  if (Math.abs(bpm - nearestInt) <= 0.25) return { value: nearestInt, display: String(nearestInt) }
  const nearestHalf = Math.round(bpm * 2) / 2
  if (Math.abs(bpm - nearestHalf) <= 0.12) return { value: nearestHalf, display: nearestHalf.toFixed(1) }
  const oneDec = Math.round(bpm * 10) / 10
  return { value: oneDec, display: oneDec.toFixed(1) }
}

/** Lleva un BPM a [lo, hi) por octavas (×2 / ÷2), para comparar candidatos del mismo pulso. */
export function foldBpm(bpm: number, lo = 85, hi = 170): number {
  if (!Number.isFinite(bpm) || bpm <= 0) return bpm
  let b = bpm
  while (b >= hi) b /= 2
  while (b < lo) b *= 2
  return b
}
