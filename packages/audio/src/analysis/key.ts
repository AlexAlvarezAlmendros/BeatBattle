import { fft, hannWindow, pearson } from './dsp'
import {
  type KeyRef,
  type KeyRelationship,
  keyLabel,
  keyRelationship,
  MODE_MAJOR,
  MODE_MINOR,
  type Mode,
  toCamelot,
  toOpenKey,
} from './musicTheory'

/**
 * Motor de tonalidad (guía §4.6, tarea 1.9): estimación profesional de la tonalidad. Port a TypeScript
 * de `ReactOtpWeb/frontend/src/utils/keyEngine.js` sin cambiar la lógica ni las constantes.
 *
 * Método:
 *   1. STFT con marcos largos (≈370 ms) → picos espectrales con interpolación cuadrática.
 *   2. Afinación de referencia por el histograma de desviaciones de los picos (pistas que no están a
 *      La = 440 ya no se reparten entre clases de altura).
 *   3. HPCP (Gómez, 2006): 36 bandas, suma armónica, reparto cos², normalización por marco y puerta de
 *      silencio.
 *   4. Plantillas de cuatro perfiles publicados (Krumhansl-Kessler, Temperley, EDMA y bgate, este el
 *      mejor en música electrónica), ponderados en conjunto.
 *   5. Voto en el tiempo por tramos de ~20 s + el perfil de la pista entera: una tonalidad tiene que
 *      ganar en global y de forma constante para puntuar alta confianza.
 */

interface KeyProfile {
  name: string
  weight: number
  major: readonly number[]
  minor: readonly number[]
}

/** Perfiles publicados (índice 0 = tónica). */
export const KEY_PROFILES: readonly KeyProfile[] = [
  {
    name: 'krumhansl',
    weight: 0.85,
    major: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
    minor: [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
  },
  {
    name: 'temperley',
    weight: 1.0,
    major: [5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0],
    minor: [5.0, 2.0, 3.5, 4.5, 2.0, 4.0, 2.0, 4.5, 3.5, 2.0, 1.5, 4.0],
  },
  {
    name: 'edma',
    weight: 1.1,
    major: [1.0, 0.29, 0.5, 0.4, 0.6, 0.56, 0.32, 0.8, 0.31, 0.45, 0.42, 0.39],
    minor: [1.0, 0.31, 0.44, 0.58, 0.33, 0.49, 0.29, 0.78, 0.43, 0.29, 0.53, 0.32],
  },
  {
    name: 'bgate',
    weight: 1.15,
    major: [1.0, 0.0, 0.42, 0.0, 0.53, 0.37, 0.0, 0.77, 0.0, 0.38, 0.21, 0.3],
    minor: [1.0, 0.0, 0.36, 0.39, 0.0, 0.38, 0.0, 0.74, 0.27, 0.0, 0.42, 0.23],
  },
]

const MIN_FREQ = 55
const MAX_FREQ = 5000
const MAX_PEAKS = 40
const HPCP_BINS = 36
/** Un pico vota por f, f/2, f/3 y f/4. */
const HARMONIC_WEIGHTS = [1.0, 0.8, 0.64, 0.512] as const

interface Peak {
  freq: number
  power: number
}

function framePeaks(mag: Float64Array, sr: number, fftSize: number, out: Peak[]): number {
  const binHz = sr / fftSize
  const loBin = Math.max(2, Math.ceil(MIN_FREQ / binHz))
  const hiBin = Math.min(mag.length - 2, Math.floor(MAX_FREQ / binHz))

  let frameMax = 0
  for (let k = loBin; k <= hiBin; k++) if (mag[k]! > frameMax) frameMax = mag[k]!
  if (frameMax <= 1e-9) return 0
  const thresh = Math.max(frameMax * 1e-3, 1e-8) // suelo relativo de −60 dB

  let count = 0
  for (let k = loBin; k <= hiBin && count < MAX_PEAKS * 3; k++) {
    const m = mag[k]!
    if (m < thresh || m <= mag[k - 1]! || m < mag[k + 1]!) continue
    const a = Math.log(mag[k - 1]! + 1e-12)
    const b = Math.log(m + 1e-12)
    const c = Math.log(mag[k + 1]! + 1e-12)
    const denom = a - 2 * b + c
    const off = Math.abs(denom) > 1e-12 ? Math.min(0.5, Math.max(-0.5, (0.5 * (a - c)) / denom)) : 0
    out.push({ freq: (k + off) * binHz, power: m * m })
    count++
  }

  if (count > MAX_PEAKS) {
    out.sort((p, q) => q.power - p.power)
    out.length = MAX_PEAKS
  }
  let power = 0
  for (const p of out) power += p.power
  return power
}

function estimateTuningCents(histogram: Float64Array): number {
  const n = histogram.length // 100 bandas → 1 cent cada una, índice 0 = −50 cents
  let total = 0
  let max = 0
  for (let i = 0; i < n; i++) {
    total += histogram[i]!
    if (histogram[i]! > max) max = histogram[i]!
  }
  if (total <= 0 || max < (total / n) * 1.8) return 0 // histograma plano → se queda en 440

  const smooth = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    for (let d = -2; d <= 2; d++) smooth[i] = smooth[i]! + histogram[(i + d + n) % n]! * (3 - Math.abs(d))
  }
  let peak = 0
  for (let i = 1; i < n; i++) if (smooth[i]! > smooth[peak]!) peak = i
  const prev = smooth[(peak - 1 + n) % n]!
  const next = smooth[(peak + 1) % n]!
  const denom = prev - 2 * smooth[peak]! + next
  const off = Math.abs(denom) > 1e-12 ? Math.min(0.5, Math.max(-0.5, (0.5 * (prev - next)) / denom)) : 0
  let cents = peak + off - 50
  if (cents >= 50) cents -= 100
  return cents
}

function accumulateHPCP(peaks: readonly Peak[], tuningRef: number, hpcp: Float64Array): void {
  hpcp.fill(0)
  for (const { freq, power } of peaks) {
    for (let h = 0; h < HARMONIC_WEIGHTS.length; h++) {
      const f0 = freq / (h + 1)
      if (f0 < MIN_FREQ * 0.9) break
      const pcFrac = (((12 * Math.log2(f0 / tuningRef) + 69) % 12) + 12) % 12
      const center = pcFrac * (HPCP_BINS / 12)
      // Reparto cos² en ±1,5 bandas (±½ semitono).
      const lo = Math.ceil(center - 1.5)
      for (let b = lo; b <= center + 1.5; b++) {
        const d = (b - center) / 1.5
        const w = Math.cos((Math.PI / 2) * d)
        const bin = ((b % HPCP_BINS) + HPCP_BINS) % HPCP_BINS
        hpcp[bin] = hpcp[bin]! + power * HARMONIC_WEIGHTS[h]! * w * w
      }
    }
  }
}

function foldTo12(h36: Float64Array): Float64Array {
  const pc = new Float64Array(12)
  for (let p = 0; p < 12; p++) {
    const c = 3 * p
    pc[p] = 0.5 * h36[(c - 1 + HPCP_BINS) % HPCP_BINS]! + h36[c]! + 0.5 * h36[(c + 1) % HPCP_BINS]!
  }
  return pc
}

/** Pearson ponderado de todos los perfiles; puntuación de las 24 tonalidades (raíz + 12 si es menor). */
function ensembleScores(chroma12: Float64Array): Float64Array {
  const scores = new Float64Array(24)
  const rotated = new Array<number>(12)
  for (let root = 0; root < 12; root++) {
    for (let i = 0; i < 12; i++) rotated[i] = chroma12[(i + root) % 12]!
    for (const prof of KEY_PROFILES) {
      scores[root] = scores[root]! + prof.weight * pearson(rotated, prof.major)
      scores[root + 12] = scores[root + 12]! + prof.weight * pearson(rotated, prof.minor)
    }
  }
  const totalW = KEY_PROFILES.reduce((s, p) => s + p.weight, 0)
  for (let i = 0; i < 24; i++) scores[i] = scores[i]! / totalW
  return scores
}

function ensembleScoresSingle(chroma12: Float64Array, prof: KeyProfile): Float64Array {
  const scores = new Float64Array(24)
  const rotated = new Array<number>(12)
  for (let root = 0; root < 12; root++) {
    for (let i = 0; i < 12; i++) rotated[i] = chroma12[(i + root) % 12]!
    scores[root] = pearson(rotated, prof.major)
    scores[root + 12] = pearson(rotated, prof.minor)
  }
  return scores
}

function argmax24(scores: Float64Array, skip = -1): number {
  let best = -1
  for (let i = 0; i < 24; i++) {
    if (i === skip) continue
    if (best < 0 || scores[i]! > scores[best]!) best = i
  }
  return best
}

const idxToKey = (i: number): KeyRef => ({ pitchClass: i % 12, mode: i < 12 ? MODE_MAJOR : MODE_MINOR })

export interface KeyEstimate {
  pitchClass: number
  mode: Mode
  note: string
  camelot: string | null
  openKey: string | null
  confidence: number
  tuningHz: number
  tuningCents: number
  alternative: {
    note: string
    mode: Mode
    pitchClass: number
    camelot: string
    relationship: KeyRelationship
  } | null
  chroma: number[] | null
  details?: { usedChunks: number; keptFrames: number; profileAgree: number }
}

export function estimateKey(
  pcm: Float32Array,
  sr: number,
  { onProgress }: { onProgress?: (fraction: number) => void } = {},
): KeyEstimate {
  const report = (p: number) => onProgress?.(p)

  // Ventana central de hasta 4 minutos.
  const maxSamples = Math.floor(240 * sr)
  let segment = pcm
  if (pcm.length > maxSamples) {
    const start = Math.floor((pcm.length - maxSamples) / 2)
    segment = pcm.subarray(start, start + maxSamples)
  }

  let fftSize = 1
  while (fftSize < sr * 0.34) fftSize <<= 1 // 8192 a 22 050 Hz → 2,7 Hz por banda
  const hop = fftSize >> 1
  const nFrames = Math.max(0, Math.floor((segment.length - fftSize) / hop) + 1)

  const empty: KeyEstimate = {
    pitchClass: -1,
    mode: MODE_MINOR,
    note: '—',
    camelot: null,
    openKey: null,
    confidence: 0,
    tuningHz: 440,
    tuningCents: 0,
    alternative: null,
    chroma: null,
  }
  if (nFrames < 4) return empty

  const win = hannWindow(fftSize)
  const re = new Float64Array(fftSize)
  const im = new Float64Array(fftSize)
  const mag = new Float64Array(fftSize >> 1)

  // Pasada 1: picos por marco + histograma global de afinación.
  const allPeaks = new Array<Peak[]>(nFrames)
  const framePower = new Float64Array(nFrames)
  const tuningHist = new Float64Array(100)
  for (let f = 0; f < nFrames; f++) {
    const off = f * hop
    for (let i = 0; i < fftSize; i++) {
      re[i] = segment[off + i]! * win[i]!
      im[i] = 0
    }
    fft(re, im)
    for (let k = 0; k < mag.length; k++) mag[k] = Math.sqrt(re[k]! * re[k]! + im[k]! * im[k]!)

    const peaks: Peak[] = []
    framePower[f] = framePeaks(mag, sr, fftSize, peaks)
    allPeaks[f] = peaks

    for (const { freq, power } of peaks) {
      if (freq < 110 || freq > 3520) continue
      const cents = 1200 * Math.log2(freq / 440)
      const dev = ((cents % 100) + 150) % 100 // 0..100, 50 = afinado
      const bin = Math.min(99, Math.max(0, Math.round(dev)))
      tuningHist[bin] = tuningHist[bin]! + Math.sqrt(power)
    }
    if ((f & 63) === 0) report(0.05 + 0.55 * (f / nFrames))
  }

  const tuningCents = estimateTuningCents(tuningHist)
  const tuningRef = 440 * 2 ** (tuningCents / 1200)
  report(0.65)

  // Puerta de silencio: fuera los marcos muy por debajo de la mediana de potencia armónica.
  const powers = Array.from(framePower)
    .filter((p) => p > 0)
    .sort((a, b) => a - b)
  if (powers.length < 4) return empty
  const medianPower = powers[Math.floor(powers.length / 2)]!
  const gate = medianPower * 0.02

  // Pasada 2: HPCP por marco → media de la pista + medias por tramos de ~20 s.
  const CHUNK_SEC = 20
  const framesPerChunk = Math.max(1, Math.round((CHUNK_SEC * sr) / hop))
  const nChunks = Math.ceil(nFrames / framesPerChunk)
  const hpcpFrame = new Float64Array(HPCP_BINS)
  const hpcpFull = new Float64Array(HPCP_BINS)
  const hpcpChunks = Array.from({ length: nChunks }, () => new Float64Array(HPCP_BINS))
  const chunkFrames = new Int32Array(nChunks)
  let keptFrames = 0

  for (let f = 0; f < nFrames; f++) {
    const peaks = allPeaks[f]!
    if (framePower[f]! < gate || peaks.length === 0) continue
    accumulateHPCP(peaks, tuningRef, hpcpFrame)
    let fMax = 0
    for (let i = 0; i < HPCP_BINS; i++) if (hpcpFrame[i]! > fMax) fMax = hpcpFrame[i]!
    if (fMax <= 0) continue
    const chunk = Math.min(nChunks - 1, Math.floor(f / framesPerChunk))
    const chunkHpcp = hpcpChunks[chunk]!
    for (let i = 0; i < HPCP_BINS; i++) {
      const v = hpcpFrame[i]! / fMax
      hpcpFull[i] = hpcpFull[i]! + v
      chunkHpcp[i] = chunkHpcp[i]! + v
    }
    chunkFrames[chunk] = chunkFrames[chunk]! + 1
    keptFrames++
  }
  if (keptFrames < 4) return empty
  report(0.8)

  const chroma12 = foldTo12(hpcpFull)
  const globalScores = ensembleScores(chroma12)

  // Voto en el tiempo: cada tramo útil vota por su tonalidad, con el peso de lo decisivo que fue.
  const chunkVotes = new Float64Array(24)
  let chunkTotal = 0
  let usedChunks = 0
  for (let c = 0; c < nChunks; c++) {
    if (chunkFrames[c]! < framesPerChunk * 0.15) continue
    const scores = ensembleScores(foldTo12(hpcpChunks[c]!))
    const best = argmax24(scores)
    const second = argmax24(scores, best)
    const margin = Math.max(0, scores[best]! - scores[second]!)
    const w = Math.max(0, scores[best]!) * (0.4 + 0.6 * Math.min(1, margin * 8))
    chunkVotes[best] = chunkVotes[best]! + w
    chunkTotal += w
    usedChunks++
  }
  report(0.92)

  let gMin = Number.POSITIVE_INFINITY
  let gMax = Number.NEGATIVE_INFINITY
  for (let i = 0; i < 24; i++) {
    if (globalScores[i]! < gMin) gMin = globalScores[i]!
    if (globalScores[i]! > gMax) gMax = globalScores[i]!
  }
  const gSpan = gMax - gMin || 1
  const finalScores = new Float64Array(24)
  for (let i = 0; i < 24; i++) {
    const globalN = (globalScores[i]! - gMin) / gSpan
    const voteShare = chunkTotal > 0 ? chunkVotes[i]! / chunkTotal : 0
    finalScores[i] = 0.55 * globalN + 0.45 * voteShare
  }

  const bestIdx = argmax24(finalScores)
  const secondIdx = argmax24(finalScores, bestIdx)
  const winner = idxToKey(bestIdx)
  const second = idxToKey(secondIdx)

  // Confianza: ajuste absoluto al perfil, margen sobre la segunda, acuerdo en el tiempo y unanimidad
  // entre perfiles.
  const winnerCorr = globalScores[bestIdx]!
  const margin = finalScores[bestIdx]! - finalScores[secondIdx]!
  const voteShareWinner = chunkTotal > 0 ? chunkVotes[bestIdx]! / chunkTotal : 0
  let profileAgree = 0
  for (const prof of KEY_PROFILES) {
    if (argmax24(ensembleScoresSingle(chroma12, prof)) === bestIdx) profileAgree++
  }
  const corrN = Math.min(1, Math.max(0, (winnerCorr - 0.1) / 0.75))
  const confidence = Math.round(
    Math.min(
      98,
      Math.max(
        5,
        100 *
          (0.34 * corrN +
            0.27 * voteShareWinner +
            0.21 * (profileAgree / KEY_PROFILES.length) +
            0.18 * Math.min(1, margin * 5)),
      ),
    ),
  )

  const showAlt = margin < 0.18
  const relationship = keyRelationship(winner, second)
  const { note, mode } = keyLabel(winner.pitchClass, winner.mode)
  return {
    pitchClass: winner.pitchClass,
    mode,
    note,
    camelot: toCamelot(winner.pitchClass, winner.mode),
    openKey: toOpenKey(winner.pitchClass, winner.mode),
    confidence,
    tuningHz: Math.round(tuningRef * 10) / 10,
    tuningCents: Math.round(tuningCents),
    alternative: showAlt
      ? {
          ...keyLabel(second.pitchClass, second.mode),
          pitchClass: second.pitchClass,
          camelot: toCamelot(second.pitchClass, second.mode),
          relationship,
        }
      : null,
    chroma: Array.from(chroma12),
    details: { usedChunks, keptFrames, profileAgree },
  }
}
