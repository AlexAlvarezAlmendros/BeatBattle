import { estimateKey, type KeyEstimate } from './key'
import { type Mode, snapBpm } from './musicTheory'
import { estimateTempo, type TempoMetrics } from './tempo'

/**
 * Orquestador del análisis (guía §4.6, `RF-ENT-06`; tarea 1.9): función pura sobre PCM mono, igual en
 * un worker, en el hilo principal o en Node (la batería de validación). Port de
 * `ReactOtpWeb/frontend/src/utils/audioEngine.js`.
 */

/** Los motores están ajustados para esta frecuencia: el cliente remuestrea el audio decodificado a ella. */
export const ENGINE_SAMPLE_RATE = 22_050

/** Errores tipados que describen el audio (no el entorno): se enseñan, no disparan el plan B. */
export const AUDIO_ERRORS = ['AUDIO_TOO_SHORT', 'AUDIO_SILENT'] as const
export type AudioErrorCode = (typeof AUDIO_ERRORS)[number]

export type AnalysisStage = 'decode' | 'bpm' | 'key' | 'done'

export interface AnalysisProgress {
  stage: AnalysisStage
  pct: number
}

export interface AnalysisResult {
  bpm: number
  bpmDisplay: string
  bpmConfidence: number
  bpmAlt: number | null
  bpmAltDisplay: string | null
  key: string
  mode: Mode
  camelot: string | null
  openKey: string | null
  keyConfidence: number
  keyAlternative: KeyEstimate['alternative']
  tuningHz: number
  tuningCents: number
  duration: number
  metrics: { tempo: TempoMetrics | null; key: KeyEstimate['details'] | null }
}

export function analyzeAudioData(
  pcm: Float32Array,
  sampleRate: number,
  { duration, onProgress }: { duration?: number; onProgress?: (progress: AnalysisProgress) => void } = {},
): AnalysisResult {
  const report = (stage: AnalysisStage, pct: number) =>
    onProgress?.({ stage, pct: Math.min(100, Math.round(pct)) })

  if (!pcm || pcm.length < sampleRate * 3) throw new Error('AUDIO_TOO_SHORT')

  let rms = 0
  for (let i = 0; i < pcm.length; i += 16) rms += pcm[i]! * pcm[i]!
  rms = Math.sqrt(rms / Math.ceil(pcm.length / 16))
  if (rms < 1e-5) throw new Error('AUDIO_SILENT')

  report('bpm', 2)
  const tempo = estimateTempo(pcm, sampleRate, { onProgress: (p) => report('bpm', 2 + p * 53) })

  report('key', 55)
  const key = estimateKey(pcm, sampleRate, { onProgress: (p) => report('key', 55 + p * 43) })

  const snapped = snapBpm(tempo.bpm)
  const altSnapped = tempo.alt ? snapBpm(tempo.alt) : null
  report('done', 100)

  return {
    bpm: snapped.value,
    bpmDisplay: snapped.display,
    bpmConfidence: tempo.confidence,
    bpmAlt: altSnapped ? altSnapped.value : null,
    bpmAltDisplay: altSnapped ? altSnapped.display : null,
    key: key.note,
    mode: key.mode,
    camelot: key.camelot,
    openKey: key.openKey,
    keyConfidence: key.confidence,
    keyAlternative: key.alternative,
    tuningHz: key.tuningHz,
    tuningCents: key.tuningCents,
    duration: duration ?? pcm.length / sampleRate,
    metrics: { tempo: tempo.metrics, key: key.details ?? null },
  }
}
