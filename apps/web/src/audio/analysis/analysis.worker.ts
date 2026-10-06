/// <reference lib="webworker" />
import { analyzeAudioData } from '@beatbattle/audio/analysis'

/**
 * Worker del motor de análisis (guía §4.6, tarea 1.9): el DSP fuera del hilo principal, con el progreso de
 * vuelta para la interfaz. Port de `ReactOtpWeb/frontend/src/workers/audioAnalysis.worker.js`.
 */

export interface AnalysisJob {
  id: number
  pcm: Float32Array
  sampleRate: number
  duration: number
}

const scope = self as unknown as DedicatedWorkerGlobalScope

scope.onmessage = (event: MessageEvent<AnalysisJob>) => {
  const { id, pcm, sampleRate, duration } = event.data
  try {
    const result = analyzeAudioData(pcm, sampleRate, {
      duration,
      onProgress: ({ stage, pct }) => scope.postMessage({ id, type: 'progress', stage, pct }),
    })
    scope.postMessage({ id, type: 'result', result })
  } catch (error) {
    scope.postMessage({ id, type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}
