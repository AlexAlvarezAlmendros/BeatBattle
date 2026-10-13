import type { AnalysisProgress, AnalysisResult, AnalysisStage } from '@beatbattle/audio/analysis'

/**
 * Cliente del motor de análisis en el navegador (guía §4.6, `RF-ENT-06`; tarea 1.9). Port de
 * `ReactOtpWeb/frontend/src/utils/audioAnalysis.js`:
 *
 * 1. Decodifica el fichero con Web Audio y lo remuestrea a la frecuencia del motor (22 050 Hz) con un
 *    render en `OfflineAudioContext` (antialias de verdad y mono).
 * 2. Analiza en un Web Worker (la interfaz sigue respondiendo y hay progreso).
 * 3. Si no hay worker, el mismo motor en el hilo principal (resultados idénticos).
 *
 * El análisis es 100 % local: el audio no sale del dispositivo.
 */

/** Frecuencia de trabajo del motor (`ENGINE_SAMPLE_RATE`): aquí sin importar el motor, que va en el worker. */
const ENGINE_SAMPLE_RATE = 22_050

/** Errores que describen el audio y se enseñan tal cual (no disparan el plan B del hilo principal). */
const AUDIO_ERRORS = new Set(['AUDIO_TOO_SHORT', 'AUDIO_SILENT'])

/** Tiempo máximo del worker (ms). */
const WORKER_TIMEOUT_MS = 120_000

export interface DecodedAudio {
  pcm: Float32Array
  sampleRate: number
  duration: number
}

export async function decodeToMono(data: ArrayBuffer): Promise<DecodedAudio> {
  const Context =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  const probe = new Context()
  let decoded: AudioBuffer
  try {
    decoded = await probe.decodeAudioData(data)
  } finally {
    probe.close().catch(() => {})
  }
  const length = Math.max(1, Math.ceil(decoded.duration * ENGINE_SAMPLE_RATE))
  const offline = new OfflineAudioContext(1, length, ENGINE_SAMPLE_RATE)
  const source = offline.createBufferSource()
  source.buffer = decoded
  source.connect(offline.destination)
  source.start(0)
  const rendered = await offline.startRendering()
  return { pcm: rendered.getChannelData(0), sampleRate: ENGINE_SAMPLE_RATE, duration: decoded.duration }
}

class AudioAnalysisError extends Error {
  constructor(
    message: string,
    readonly audioError: boolean,
  ) {
    super(message)
  }
}

let worker: Worker | null = null
let jobSeq = 0

function getWorker(): Worker {
  worker ??= new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' })
  return worker
}

export function disposeAnalyzer(): void {
  worker?.terminate()
  worker = null
}

type Report = (stage: AnalysisStage, pct: number) => void

type WorkerMessage =
  | { id: number; type: 'progress'; stage: AnalysisStage; pct: number }
  | { id: number; type: 'result'; result: AnalysisResult }
  | { id: number; type: 'error'; message: string }

function analyzeInWorker(audio: DecodedAudio, report: Report): Promise<AnalysisResult> {
  return new Promise((resolve, reject) => {
    const w = getWorker()
    const id = ++jobSeq
    const timeout = setTimeout(() => {
      cleanup()
      disposeAnalyzer()
      reject(new AudioAnalysisError('WORKER_TIMEOUT', false))
    }, WORKER_TIMEOUT_MS)

    const onMessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data
      if (!message || message.id !== id) return
      if (message.type === 'progress') {
        report(message.stage, 10 + message.pct * 0.9)
        return
      }
      cleanup()
      if (message.type === 'result') resolve(message.result)
      else reject(new AudioAnalysisError(message.message, AUDIO_ERRORS.has(message.message)))
    }
    const onError = () => {
      cleanup()
      disposeAnalyzer()
      reject(new AudioAnalysisError('WORKER_FAILED', false))
    }
    function cleanup() {
      clearTimeout(timeout)
      w.removeEventListener('message', onMessage)
      w.removeEventListener('error', onError)
    }

    w.addEventListener('message', onMessage)
    w.addEventListener('error', onError)
    // Se transfiere una copia: el original queda para el plan B del hilo principal (y para quien lo pidió).
    const pcm = audio.pcm.slice()
    w.postMessage({ id, pcm, sampleRate: audio.sampleRate, duration: audio.duration }, [pcm.buffer])
  })
}

export interface AnalyzeOptions {
  onProgress?: (progress: AnalysisProgress) => void
  /** Solo para pruebas: sin worker, como un navegador que no lo tiene. */
  withoutWorker?: boolean
}

async function onMainThread(audio: DecodedAudio, report: Report): Promise<AnalysisResult> {
  // Deja pintar el progreso antes del cálculo síncrono.
  await new Promise((resolve) => setTimeout(resolve, 30))
  const { analyzeAudioData } = await import('@beatbattle/audio/analysis')
  return analyzeAudioData(audio.pcm, audio.sampleRate, {
    duration: audio.duration,
    onProgress: ({ stage, pct }) => report(stage, 10 + pct * 0.9),
  })
}

/**
 * Analiza un audio ya decodificado (`decodeToMono`): en el worker o, si no lo hay o se cae, en el hilo
 * principal. El progreso empieza en el 10 % (lo de antes es la decodificación). Para quien también necesita
 * el PCM (la onda de `/subir`), sin decodificar dos veces.
 */
export async function analyzeDecoded(
  audio: DecodedAudio,
  options: AnalyzeOptions = {},
): Promise<AnalysisResult> {
  const report: Report = (stage, pct) => options.onProgress?.({ stage, pct: Math.min(100, Math.round(pct)) })
  if (options.withoutWorker || typeof Worker === 'undefined') return onMainThread(audio, report)
  try {
    return await analyzeInWorker(audio, report)
  } catch (error) {
    if (error instanceof AudioAnalysisError && error.audioError) throw error
    // Sin worker o se ha caído: el mismo motor en el hilo principal.
    return onMainThread(audio, report)
  }
}

/** Analiza un fichero de audio. `onProgress` recibe `{ stage: 'decode' | 'bpm' | 'key' | 'done', pct }`. */
export async function analyzeAudioFile(file: Blob, options: AnalyzeOptions = {}): Promise<AnalysisResult> {
  options.onProgress?.({ stage: 'decode', pct: 2 })
  const audio = await decodeToMono(await file.arrayBuffer())
  options.onProgress?.({ stage: 'decode', pct: 10 })
  return analyzeDecoded(audio, options)
}
