import { fft, generalizedACF, hannWindow, lowpassFIR, movingMean, parabolicPeak, sampleAt } from './dsp'

/**
 * Motor de tempo (guía §4.6, tarea 1.9): estimación profesional del BPM. Port a TypeScript de
 * `ReactOtpWeb/frontend/src/utils/tempoEngine.js` sin cambiar la lógica ni las constantes.
 *
 * Método (diseños publicados y validados con bancos de pruebas):
 *   1. Señal de fuerza de ataques (OSS), banda completa y banda grave: flujo espectral con compresión
 *      logarítmica, paso bajo y sin tendencia (Percival y Tzanetakis, 2014).
 *   2. Periodo del pulso: autocorrelación generalizada con refuerzo armónico, en ventanas de ~12 s
 *      solapadas y acumulada en una densidad de núcleo sobre el BPM (voto de toda la pista).
 *   3. Nivel métrico (la octava): peines de pulsos sobre la banda del bombo y el bajo; gana el nivel más
 *      rápido con todos los pulsos anclados; si no, la estructura compuesta × un prior ancho.
 *   4. Verificación y refinado: seguimiento de pulsos por programación dinámica (Ellis, 2007, como en
 *      librosa) → intervalo medio entre pulsos de los valores típicos, y una confianza honesta.
 */

const MIN_BPM = 50
const MAX_BPM = 210

/** Banda grave (< 160 Hz: fundamentales de bombo y bajo); decide entre 128 y 64 BPM. */
const LOW_BAND_HZ = 160

function postProcessOSS(raw: Float32Array, ossSr: number): Float32Array {
  const smoothed = lowpassFIR(raw, 8 / ossSr, 21)
  const trend = movingMean(smoothed, Math.round(ossSr * 0.75))
  const out = new Float32Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = Math.max(0, smoothed[i]! - trend[i]!)
  return out
}

export function computeOSS(
  pcm: Float32Array,
  sr: number,
): { oss: Float32Array; ossLow: Float32Array; ossSr: number } {
  // Marco ≈ 46 ms, salto = marco/8 → OSS a ≈ 172 Hz con 22 050 Hz de entrada.
  let frame = 1
  while (frame < sr * 0.0464) frame <<= 1
  const hop = frame >> 3
  const half = frame >> 1
  const n = pcm.length
  const nFrames = Math.max(0, Math.floor((n - frame) / hop) + 1)
  const ossSr = sr / hop

  const win = hannWindow(frame)
  const re = new Float64Array(frame)
  const im = new Float64Array(frame)
  const prev = new Float32Array(half)
  const oss = new Float32Array(nFrames)
  const ossLow = new Float32Array(nFrames)
  const lowBins = Math.max(2, Math.ceil((LOW_BAND_HZ * frame) / sr))

  for (let f = 0; f < nFrames; f++) {
    const off = f * hop
    for (let i = 0; i < frame; i++) {
      re[i] = pcm[off + i]! * win[i]!
      im[i] = 0
    }
    fft(re, im)

    let flux = 0
    let fluxLow = 0
    for (let k = 1; k < half; k++) {
      const mag = Math.sqrt(re[k]! * re[k]! + im[k]! * im[k]!)
      const lm = Math.log1p(100 * mag)
      const d = lm - prev[k]!
      if (d > 0 && f > 0) {
        flux += d
        if (k <= lowBins) fluxLow += d
      }
      prev[k] = lm
    }
    oss[f] = flux
    ossLow[f] = fluxLow
  }

  if (nFrames === 0) return { oss, ossLow, ossSr }
  return { oss: postProcessOSS(oss, ossSr), ossLow: postProcessOSS(ossLow, ossSr), ossSr }
}

interface WindowEstimate {
  bpm: number
  strength: number
}

function windowPeriodEstimate(ossWin: Float32Array, ossSr: number): WindowEstimate | null {
  const acf = generalizedACF(ossWin, 1)
  const minLag = Math.max(2, Math.floor((60 / MAX_BPM) * ossSr))
  const maxLag = Math.min(ossWin.length - 1, Math.ceil((60 / MIN_BPM) * ossSr))
  if (maxLag - minLag < 4) return null

  // Refuerzo armónico: un periodo de verdad tiene picos en sus múltiplos; se busca cada múltiplo con una
  // pequeña tolerancia.
  const HARMONICS: readonly (readonly [number, number])[] = [
    [1, 1.0],
    [2, 0.75],
    [3, 0.3],
    [4, 0.5],
  ]
  const score = new Float64Array(maxLag + 1)
  const nAcf = acf.length
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0
    let wSum = 0
    for (const [m, w] of HARMONICS) {
      const center = m * lag
      if (center >= nAcf) break
      const tol = Math.max(1, Math.round(0.015 * center))
      let best = Number.NEGATIVE_INFINITY
      const lo = Math.max(0, center - tol)
      const hi = Math.min(nAcf - 1, center + tol)
      for (let i = lo; i <= hi; i++) if (acf[i]! > best) best = acf[i]!
      s += w * best
      wSum += w
    }
    score[lag] = wSum > 0 ? s / wSum : 0
  }

  let bestLag = minLag
  for (let lag = minLag + 1; lag <= maxLag; lag++) {
    if (score[lag]! > score[bestLag]!) bestLag = lag
  }
  const { pos, val } = parabolicPeak(score, bestLag)
  if (!(val > 0)) return null
  return { bpm: (60 * ossSr) / pos, strength: val }
}

/** Acumula las estimaciones de las ventanas en una densidad de núcleo sobre el BPM. */
function tempoKDE(estimates: readonly WindowEstimate[]): { kde: Float64Array; step: number } {
  const step = 0.25
  const nBins = Math.floor((MAX_BPM - MIN_BPM) / step) + 1
  const kde = new Float64Array(nBins)
  for (const { bpm, strength } of estimates) {
    const sigma = Math.max(0.75, 0.02 * bpm)
    const lo = Math.max(0, Math.floor((bpm - 4 * sigma - MIN_BPM) / step))
    const hi = Math.min(nBins - 1, Math.ceil((bpm + 4 * sigma - MIN_BPM) / step))
    for (let i = lo; i <= hi; i++) {
      const b = MIN_BPM + i * step
      const z = (b - bpm) / sigma
      kde[i] = kde[i]! + strength * Math.exp(-0.5 * z * z)
    }
  }
  return { kde, step }
}

/**
 * ¿Sirve la banda de ancla? Cuando es *impulsiva*: pocos ataques fuertes sobre casi silencio (bombo y
 * bajo), no un relleno denso (los charles llenan cada corchea en la banda completa, y por eso no deciden
 * el nivel métrico).
 */
export function bandIsImpulsive(x: Float32Array): boolean {
  const n = x.length
  if (n < 16) return false
  const sorted = Float32Array.from(x).sort()
  const median = sorted[n >> 1]!
  const p90 = sorted[Math.floor(n * 0.9)]!
  let mean = 0
  for (let i = 0; i < n; i++) mean += x[i]!
  mean /= n
  return mean > 1e-9 && p90 > 4 * Math.max(median, mean * 0.02)
}

interface LevelMetrics {
  onMean: number
  onMeanN: number
  offRatio: number
  onCV: number
  support: number
  composite: number
}

/**
 * Muestrea la señal de ancla con un peine al periodo candidato, en la fase de mayor media en pulso, y
 * mide el apoyo (las ranuras más débiles frente a su mediana), la relación fuera/en pulso y la variación
 * entre pulsos.
 */
function pulseSpanMetrics(sig: Float32Array, ossSr: number, bpm: number): LevelMetrics | null {
  const period = (60 / bpm) * ossSr
  const n = sig.length
  const nBeats = Math.floor((n - 1) / period)
  if (nBeats < 4) return null

  let globalMean = 0
  for (let i = 0; i < n; i++) globalMean += sig[i]!
  globalMean /= n
  if (globalMean <= 1e-9) return null

  const N_PHASES = 24
  let best: LevelMetrics | null = null
  const samples: number[] = []
  for (let p = 0; p < N_PHASES; p++) {
    const phase = (p * period) / N_PHASES
    let on = 0
    let on2 = 0
    let off = 0
    let count = 0
    samples.length = 0
    for (let k = 0; k * period + phase < n - 1; k++) {
      const pos = phase + k * period
      const v = sampleAt(sig, pos)
      on += v
      on2 += v * v
      samples.push(v)
      off += sampleAt(sig, Math.min(n - 1, pos + 0.5 * period))
      count++
    }
    if (count < 4) continue
    const onMean = on / count
    if (best && onMean <= best.onMean) continue

    off /= count
    const variance = Math.max(0, on2 / count - onMean * onMean)
    const onCV = onMean > 1e-9 ? Math.sqrt(variance) / onMean : 1
    const offRatio = Math.min(1, off / Math.max(onMean, 1e-9))

    samples.sort((a, b) => a - b)
    const kWeak = Math.max(1, Math.floor(samples.length * 0.3))
    let weak = 0
    for (let i = 0; i < kWeak; i++) weak += samples[i]!
    weak /= kWeak
    const median = samples[Math.floor(samples.length / 2)]!
    const support = median > 1e-9 ? Math.min(1, weak / median) : 0

    best = {
      onMean,
      onMeanN: onMean / globalMean,
      offRatio,
      onCV,
      support,
      composite: (onMean / globalMean) * (1 - 0.45 * offRatio) * (1 - 0.3 * Math.min(1, onCV)),
    }
  }
  return best
}

/**
 * El peine se desfasa en fragmentos largos, así que las métricas se miden en hasta tres tramos cortos y
 * se combinan por mediana (aguanta que un tramo caiga en un *breakdown*).
 */
function pulseLevelMetrics(
  sig: Float32Array,
  ossSr: number,
  bpm: number,
): Omit<LevelMetrics, 'onMean'> | null {
  const spanLen = Math.min(sig.length, Math.round(15 * ossSr))
  const starts =
    sig.length <= spanLen ? [0] : [0, Math.floor((sig.length - spanLen) / 2), sig.length - spanLen]
  const spans: LevelMetrics[] = []
  for (const s of starts) {
    const m = pulseSpanMetrics(sig.subarray(s, s + spanLen), ossSr, bpm)
    if (m) spans.push(m)
  }
  if (spans.length === 0) return null
  const med = (key: keyof LevelMetrics) => {
    const v = spans.map((s) => s[key]).sort((a, b) => a - b)
    return v[Math.floor(v.length / 2)]!
  }
  return {
    onMeanN: med('onMeanN'),
    offRatio: med('offRatio'),
    onCV: med('onCV'),
    support: med('support'),
    composite: med('composite'),
  }
}

/** Prior log-normal ancho sobre el tempo (σ = 0,9 octavas alrededor de 120 BPM). */
function tempoPrior(bpm: number): number {
  const z = Math.log2(bpm / 120) / 0.9
  return Math.exp(-0.5 * z * z)
}

export interface BeatTrack {
  bpm: number
  nBeats: number
  ibiCV: number
  beatSalience: number
}

/** Seguimiento de pulsos por programación dinámica (Ellis, 2007). */
export function trackBeats(oss: Float32Array, ossSr: number, bpm: number, tightness = 100): BeatTrack | null {
  const n = oss.length
  const tau = (60 / bpm) * ossSr
  if (n < tau * 3) return null

  let mean = 0
  for (let i = 0; i < n; i++) mean += oss[i]!
  mean /= n
  if (mean <= 1e-9) return null
  const O = new Float64Array(n)
  for (let i = 0; i < n; i++) O[i] = oss[i]! / mean

  const minD = Math.max(1, Math.round(0.5 * tau))
  const maxD = Math.min(n - 1, Math.round(2 * tau))
  const C = new Float64Array(n)
  const ptr = new Int32Array(n).fill(-1)

  for (let t = 0; t < n; t++) {
    let bestScore = 0
    let bestPrev = -1
    if (t >= minD) {
      const dHi = Math.min(maxD, t)
      for (let d = minD; d <= dHi; d++) {
        const logRatio = Math.log(d / tau)
        const s = C[t - d]! - tightness * logRatio * logRatio
        if (s > bestScore) {
          bestScore = s
          bestPrev = t - d
        }
      }
    }
    C[t] = O[t]! + bestScore
    ptr[t] = bestPrev
  }

  let end = n - 1
  const searchFrom = Math.max(0, n - Math.round(tau * 1.5))
  for (let t = searchFrom; t < n; t++) if (C[t]! > C[end]!) end = t

  const beats: number[] = []
  for (let t = end; t >= 0; t = ptr[t]!) {
    beats.push(t)
    if (ptr[t]! < 0) break
  }
  beats.reverse()
  if (beats.length < 4) return null

  const ibis: number[] = []
  for (let i = 1; i < beats.length; i++) ibis.push(beats[i]! - beats[i - 1]!)
  const sorted = [...ibis].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]!
  const q1 = sorted[Math.floor(sorted.length * 0.25)]!
  const q3 = sorted[Math.floor(sorted.length * 0.75)]!
  const iqrCV = median > 0 ? (q3 - q1) / median : 1

  // Los pulsos caen en marcos enteros: la mediana hereda esa cuantización (~0,6 % a 128 BPM). La media
  // de los intervalos típicos recupera la precisión por debajo del marco.
  let ibiSum = 0
  let ibiCount = 0
  for (const d of ibis) {
    if (Math.abs(d - median) <= Math.max(2, median * 0.04)) {
      ibiSum += d
      ibiCount++
    }
  }
  const refined = ibiCount > 0 ? ibiSum / ibiCount : median

  let onBeat = 0
  for (const b of beats) onBeat += O[b]!
  onBeat /= beats.length

  return { bpm: (60 * ossSr) / refined, nBeats: beats.length, ibiCV: iqrCV, beatSalience: onBeat }
}

export interface TempoMetrics {
  agreement: number
  beatSalience: number
  ibiCV: number
  levelCert: number
  medStrength: number
  windows: number
}

export interface TempoEstimate {
  bpm: number
  confidence: number
  alt: number | null
  metrics: TempoMetrics | null
}

interface Candidate {
  bpm: number
  lvl: Omit<LevelMetrics, 'onMean'>
  score: number
}

export function estimateTempo(
  pcm: Float32Array,
  sr: number,
  { onProgress }: { onProgress?: (fraction: number) => void } = {},
): TempoEstimate {
  const report = (p: number) => onProgress?.(p)

  // Como mucho, los 3 minutos centrales: evidencia de sobra con la CPU acotada.
  const maxSamples = Math.floor(180 * sr)
  let segment = pcm
  if (pcm.length > maxSamples) {
    const start = Math.floor((pcm.length - maxSamples) / 2)
    segment = pcm.subarray(start, start + maxSamples)
  }

  const { oss, ossLow, ossSr } = computeOSS(segment, sr)
  report(0.45)

  const empty: TempoEstimate = { bpm: 0, confidence: 0, alt: null, metrics: null }
  if (oss.length < ossSr * 3) return empty
  let energy = 0
  for (let i = 0; i < oss.length; i++) energy += oss[i]!
  if (energy / oss.length < 1e-6) return empty

  const WIN = 2048
  const HOP = 512
  const estimates: WindowEstimate[] = []
  if (oss.length <= WIN) {
    const e = windowPeriodEstimate(oss, ossSr)
    if (e) estimates.push(e)
  } else {
    for (let start = 0; start + WIN <= oss.length; start += HOP) {
      const e = windowPeriodEstimate(oss.subarray(start, start + WIN), ossSr)
      if (e) estimates.push(e)
    }
  }
  if (estimates.length === 0) return empty
  report(0.65)

  const { kde, step } = tempoKDE(estimates)
  let peakIdx = 0
  for (let i = 1; i < kde.length; i++) if (kde[i]! > kde[peakIdx]!) peakIdx = i
  const { pos } = parabolicPeak(kde, peakIdx)
  let baseBpm = MIN_BPM + pos * step

  // Microajuste del periodo base (rejilla de ±1,2 %) maximizando la alineación del peine en un tramo
  // central: la cuantización de la densidad (~0,3 %) desfasaría los peines de la decisión de nivel.
  {
    const spanLen = Math.min(oss.length, Math.round(15 * ossSr))
    const from = Math.floor((oss.length - spanLen) / 2)
    const mid = oss.subarray(from, from + spanLen)
    let bestOn = -1
    let bestBpm = baseBpm
    for (let s = -4; s <= 4; s++) {
      const b = baseBpm * (1 + 0.003 * s)
      const m = pulseSpanMetrics(mid, ossSr, b)
      if (m && m.onMean > bestOn) {
        bestOn = m.onMean
        bestBpm = b
      }
    }
    baseBpm = bestBpm
  }

  // Niveles métricos candidatos del tempo base; el nivel lo decide la estructura de pulsos en la banda
  // más informativa (bombo y bajo cuando hay graves impulsivos).
  const hasLow = bandIsImpulsive(ossLow)
  const anchorSig = hasLow ? ossLow : oss
  const RATIOS: readonly (readonly [number, number])[] = [
    [0.5, 1.0],
    [2 / 3, 0.85],
    [1, 1.0],
    [1.5, 0.85],
    [2, 1.0],
  ]
  const candidates: Candidate[] = []
  for (const [ratio, penalty] of RATIOS) {
    const bpm = baseBpm * ratio
    if (bpm < MIN_BPM || bpm > MAX_BPM) continue
    if (candidates.some((c) => Math.abs(c.bpm - bpm) / bpm < 0.02)) continue
    const m = pulseLevelMetrics(anchorSig, ossSr, bpm)
    if (!m) continue
    candidates.push({ bpm, lvl: m, score: penalty * m.composite * (0.4 + 0.6 * tempoPrior(bpm)) })
  }
  if (candidates.length === 0) return empty

  // Decisión jerárquica: el nivel más rápido con todos sus pulsos anclados por bombo y bajo (el tactus
  // que marcan los DJ y las herramientas comerciales); sin graves sólidos, la puntuación compuesta.
  const supported = hasLow ? candidates.filter((c) => c.lvl.support >= 0.45 && c.lvl.onCV <= 0.6) : []
  const byScore = [...candidates].sort((a, b) => b.score - a.score)
  const supportDecided = supported.length > 0
  const winner = supportDecided ? supported.reduce((a, b) => (b.bpm > a.bpm ? b : a)) : byScore[0]!
  const runnerUp = byScore.find((c) => c !== winner) ?? null
  report(0.8)

  // Verificación y refinado con el seguimiento de pulsos.
  let bpm = winner.bpm
  const dpSpan = oss.length > ossSr * 120 ? oss.subarray(0, Math.floor(ossSr * 120)) : oss
  const beat = trackBeats(dpSpan, ossSr, bpm)
  let beatSalience = 0
  let ibiCV = 1
  if (beat) {
    if (Math.abs(beat.bpm - bpm) / bpm < 0.035) bpm = beat.bpm
    beatSalience = beat.beatSalience
    ibiCV = beat.ibiCV
  }
  report(0.95)

  // Confianza honesta a partir de evidencias independientes.
  let agreeW = 0
  let totalW = 0
  for (const { bpm: b, strength } of estimates) {
    totalW += strength
    for (const r of [0.25, 1 / 3, 0.5, 2 / 3, 0.75, 1, 4 / 3, 1.5, 2, 3, 4]) {
      if (Math.abs(b * r - bpm) / bpm < 0.045) {
        agreeW += strength
        break
      }
    }
  }
  const agreement = totalW > 0 ? agreeW / totalW : 0
  const strengths = estimates.map((e) => e.strength).sort((a, b) => a - b)
  const medStrength = strengths[Math.floor(strengths.length / 2)]!
  const periodicity = Math.min(1, Math.max(0.1, (medStrength - 0.05) / 0.22))
  const salienceN = Math.min(1, Math.max(0, (beatSalience - 1) / 2.2))
  const stability = 1 - Math.min(1, ibiCV * 7)
  const levelCert = supportDecided
    ? 0.5 + 0.5 * Math.min(1, (winner.lvl.support - 0.45) / 0.35)
    : runnerUp && runnerUp.score > 0
      ? winner.score / (winner.score + runnerUp.score)
      : 1
  const confidence = Math.round(
    Math.min(
      98,
      Math.max(
        5,
        100 * periodicity * (0.34 * agreement + 0.3 * salienceN + 0.2 * stability + 0.16 * levelCert),
      ),
    ),
  )

  // El nivel segundo, solo cuando la decisión fue de verdad ajustada.
  const alt = !supportDecided && runnerUp && runnerUp.score > winner.score * 0.72 ? runnerUp.bpm : null

  return {
    bpm,
    confidence,
    alt,
    metrics: { agreement, beatSalience, ibiCV, levelCert, medStrength, windows: estimates.length },
  }
}
