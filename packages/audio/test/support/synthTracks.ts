import { ENGINE_SAMPLE_RATE } from '../../src/analysis/engine'
import { MODE_MINOR, type Mode } from '../../src/analysis/musicTheory'

/**
 * Generador de pistas sintéticas para la batería de validación (tarea 1.9): port de
 * `ReactOtpWeb/frontend/scripts/synth-tracks.mjs` sin cambios. Todo es determinista (PRNG con semilla) y
 * se pinta a la frecuencia de trabajo del motor.
 */

export const SR = ENGINE_SAMPLE_RATE

/** PRNG determinista (mulberry32). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const noteHz = (midi: number, detune: number) => 440 * 2 ** ((midi - 69) / 12) * detune

function add(buf: Float32Array, index: number, value: number) {
  buf[index] = buf[index]! + value
}

function addKick(buf: Float32Array, t0: number, vel: number) {
  const n0 = Math.floor(t0 * SR)
  const len = Math.floor(0.35 * SR)
  const tau = 0.04
  for (let i = 0; i < len && n0 + i < buf.length; i++) {
    const t = i / SR
    const phase = 2 * Math.PI * (45 * t + 100 * tau * (1 - Math.exp(-t / tau)))
    add(buf, n0 + i, vel * Math.sin(phase) * Math.exp(-t / 0.13))
  }
}

function addSnare(buf: Float32Array, t0: number, vel: number, rng: () => number) {
  const n0 = Math.floor(t0 * SR)
  const len = Math.floor(0.22 * SR)
  let lp = 0
  for (let i = 0; i < len && n0 + i < buf.length; i++) {
    const t = i / SR
    const white = rng() * 2 - 1
    lp += 0.25 * (white - lp)
    const noise = (white - lp) * 0.7
    const tone = 0.5 * Math.sin(2 * Math.PI * 186 * t) * Math.exp(-t / 0.05)
    add(buf, n0 + i, vel * 0.8 * (noise * Math.exp(-t / 0.08) + tone))
  }
}

function addHat(buf: Float32Array, t0: number, vel: number, rng: () => number) {
  const n0 = Math.floor(t0 * SR)
  const len = Math.floor(0.06 * SR)
  let prev = 0
  for (let i = 0; i < len && n0 + i < buf.length; i++) {
    const t = i / SR
    const white = rng() * 2 - 1
    const hp = white - prev
    prev = white
    add(buf, n0 + i, vel * 0.32 * hp * Math.exp(-t / 0.022))
  }
}

function addBass(buf: Float32Array, t0: number, midi: number, dur: number, vel: number, detune: number) {
  const n0 = Math.floor(t0 * SR)
  const len = Math.floor(dur * SR)
  const f = noteHz(midi, detune)
  for (let i = 0; i < len && n0 + i < buf.length; i++) {
    const t = i / SR
    const env = Math.exp(-t / 0.18) * Math.min(1, t / 0.005)
    add(buf, n0 + i, vel * 0.9 * env * (Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(4 * Math.PI * f * t)))
  }
}

function addPadNote(buf: Float32Array, t0: number, midi: number, dur: number, vel: number, detune: number) {
  const n0 = Math.floor(t0 * SR)
  const len = Math.floor(dur * SR)
  const f = noteHz(midi, detune)
  const rel = Math.max(1, len - Math.floor(0.1 * SR))
  for (let i = 0; i < len && n0 + i < buf.length; i++) {
    const t = i / SR
    let s = 0
    for (let h = 1; h <= 6; h++) s += Math.sin(2 * Math.PI * h * f * t) / h ** 1.3
    let env = Math.min(1, t / 0.03)
    if (i > rel) env *= 1 - (i - rel) / (len - rel)
    add(buf, n0 + i, vel * env * s)
  }
}

function addArpNote(buf: Float32Array, t0: number, midi: number, vel: number, detune: number) {
  const n0 = Math.floor(t0 * SR)
  const len = Math.floor(0.12 * SR)
  const f = noteHz(midi, detune)
  for (let i = 0; i < len && n0 + i < buf.length; i++) {
    const t = i / SR
    add(buf, n0 + i, vel * 0.3 * Math.sin(2 * Math.PI * f * t) * Math.exp(-t / 0.05))
  }
}

type Chord = readonly [number, 'm' | 'M']

/** Progresiones cadenciales con tónica clara; la «axis» (i–VI–III–VII) es a propósito ambigua con la relativa. */
const PROGRESSIONS: Record<string, readonly Chord[]> = {
  cadentialMinor: [
    [0, 'm'],
    [5, 'm'],
    [7, 'M'],
    [0, 'm'],
  ],
  cadentialMajor: [
    [0, 'M'],
    [5, 'M'],
    [7, 'M'],
    [0, 'M'],
  ],
  axisMinor: [
    [0, 'm'],
    [8, 'M'],
    [3, 'M'],
    [10, 'M'],
  ],
}

const PATTERNS = {
  fourFloor: { kick: [0, 1, 2, 3], snare: [1, 3], hat: [0.5, 1.5, 2.5, 3.5], swing: 0 },
  breakbeat: { kick: [0, 1.75, 2.5], snare: [1, 3], hat: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], swing: 0 },
  hiphop: { kick: [0, 0.75, 2.25], snare: [1, 3], hat: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], swing: 0.07 },
} as const

export interface SynthOptions {
  bpm: number
  dur?: number
  keyPc: number
  mode: Mode
  pattern?: keyof typeof PATTERNS
  detuneCents?: number
  progression?: keyof typeof PROGRESSIONS
  seed?: number
  bassEighths?: boolean
  noDrums?: boolean
  noBass?: boolean
  introSec?: number
}

export function synthTrack({
  bpm,
  dur = 50,
  keyPc,
  mode,
  pattern = 'fourFloor',
  detuneCents = 0,
  progression,
  seed = 1234,
  bassEighths = false,
  noDrums = false,
  noBass = false,
  introSec = 0,
}: SynthOptions): Float32Array {
  const n = Math.floor(dur * SR)
  const buf = new Float32Array(n)
  const rng = makeRng(seed)
  const detune = 2 ** (detuneCents / 1200)
  const beat = 60 / bpm
  const bar = 4 * beat
  const nBars = Math.floor(dur / bar)
  const rootMidi = 48 + keyPc
  const prog = PROGRESSIONS[progression ?? (mode === MODE_MINOR ? 'cadentialMinor' : 'cadentialMajor')]!
  const pat = PATTERNS[pattern]
  const triad = (q: 'm' | 'M') => (q === 'M' ? [0, 4, 7] : [0, 3, 7])
  const human = () => (rng() - 0.5) * 0.006
  const velj = () => 0.9 + 0.2 * rng()

  for (let b = 0; b < nBars; b++) {
    const t0 = b * bar
    const inIntro = t0 < introSec
    const [deg, quality] = prog[b % prog.length]!
    const chordRoot = rootMidi + deg
    const tones = triad(quality)

    for (const iv of tones) addPadNote(buf, t0 + human(), chordRoot + iv, bar, 0.16 * velj(), detune)
    addPadNote(buf, t0 + human(), chordRoot + 12, bar, 0.12 * velj(), detune)

    if (!noBass && !inIntro) {
      const steps = bassEighths ? 8 : 4
      const stepBeat = bassEighths ? 0.5 : 1
      for (let q = 0; q < steps; q++) {
        addBass(
          buf,
          t0 + q * stepBeat * beat + human(),
          chordRoot - 24,
          stepBeat * beat * 0.6,
          velj(),
          detune,
        )
      }
    }

    if (!inIntro) {
      for (let e = 0; e < 8; e++) {
        const tone = tones[e % tones.length]!
        addArpNote(buf, t0 + e * 0.5 * beat + human(), chordRoot + tone + 24, velj(), detune)
      }
    }

    if (!noDrums && !inIntro) {
      for (const kb of pat.kick) addKick(buf, t0 + kb * beat + human(), velj())
      for (const sb of pat.snare) addSnare(buf, t0 + sb * beat + human(), velj(), rng)
      for (const hb of pat.hat) {
        const swung = hb % 1 !== 0 ? hb + pat.swing : hb
        addHat(buf, t0 + swung * beat + human(), velj(), rng)
      }
    }
  }

  // Ruido de fondo suave + saturación suave + normalización.
  let lp = 0
  let peak = 0
  for (let i = 0; i < n; i++) {
    lp += 0.02 * (rng() * 2 - 1 - lp)
    buf[i] = Math.tanh(0.8 * (buf[i]! + lp * 0.02))
    const a = Math.abs(buf[i]!)
    if (a > peak) peak = a
  }
  if (peak > 0) for (let i = 0; i < n; i++) buf[i] = (buf[i]! / peak) * 0.95
  return buf
}

export function synthNoise(dur: number, seed = 7): Float32Array {
  const rng = makeRng(seed)
  const n = Math.floor(dur * SR)
  const buf = new Float32Array(n)
  let lp = 0
  for (let i = 0; i < n; i++) {
    lp += 0.15 * (rng() * 2 - 1 - lp)
    buf[i] = lp * 1.5
  }
  return buf
}
