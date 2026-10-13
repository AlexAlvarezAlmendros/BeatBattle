import { ENTRY_MIN_DURATION_MS } from '@beatbattle/rules'
import type { MusicalKey } from '@beatbattle/shared'
import { useCallback, useRef, useState } from 'react'
import { analyzeDecoded, decodeToMono } from '../../audio/analysis/analyze'
import { t } from '../../i18n'
import type { WaveformPeak } from '../../ui/Waveform'
import { musicalKeyOf, peaksOf, suggestedBpm } from './entryAnalysis'
import { checkEntryFile, entryProblemMessage } from './entryFile'

/**
 * Lo que pasa al soltar un fichero en la ranura (§2.5, pasos 2 y 3; §3.8.5): comprobación local con la
 * misma regla que el servidor (`RF-ENT-03`: formato y tamaño antes de leerlo, la duración ya decodificada),
 * la onda y el análisis local de BPM y tonalidad (`RF-ENT-06`), con su progreso. El audio no sale del
 * navegador.
 */
export type EntryAnalysis =
  | { stage: 'idle' }
  | { stage: 'reading'; file: File }
  | { stage: 'analyzing'; file: File; durationMs: number; peaks: WaveformPeak[]; pct: number }
  | {
      stage: 'ready'
      file: File
      durationMs: number
      peaks: WaveformPeak[]
      bpm: number | null
      musicalKey: MusicalKey | null
    }
  | { stage: 'problem'; file: File; message: string }

export function useEntryAnalysis() {
  const [state, setState] = useState<EntryAnalysis>({ stage: 'idle' })
  // Cada fichero nuevo deja sin efecto el análisis del anterior.
  const run = useRef(0)

  const start = useCallback(async (file: File) => {
    const id = ++run.current
    const current = () => run.current === id
    // Formato y tamaño, antes de leer nada (la duración aún no cuenta).
    const early = checkEntryFile(file, ENTRY_MIN_DURATION_MS)
    if (early) {
      setState({ stage: 'problem', file, message: entryProblemMessage(early) })
      return
    }
    setState({ stage: 'reading', file })
    let audio: Awaited<ReturnType<typeof decodeToMono>>
    try {
      audio = await decodeToMono(await file.arrayBuffer())
    } catch {
      if (current()) setState({ stage: 'problem', file, message: t('pages.upload.problems.unreadable') })
      return
    }
    if (!current()) return
    const durationMs = Math.round(audio.duration * 1000)
    const problem = checkEntryFile(file, durationMs)
    if (problem) {
      setState({ stage: 'problem', file, message: entryProblemMessage(problem) })
      return
    }
    const peaks = peaksOf(audio.pcm)
    setState({ stage: 'analyzing', file, durationMs, peaks, pct: 10 })
    let bpm: number | null = null
    let musicalKey: MusicalKey | null = null
    try {
      const result = await analyzeDecoded(audio, {
        onProgress: ({ pct }) => {
          if (current()) setState((prev) => (prev.stage === 'analyzing' ? { ...prev, pct } : prev))
        },
      })
      bpm = suggestedBpm(result.bpm)
      musicalKey = musicalKeyOf(result.key, result.mode)
    } catch {
      // Silencio o sin pulso claro: se sube igual, sin sugerencia (se escribe a mano).
    }
    if (current()) setState({ stage: 'ready', file, durationMs, peaks, bpm, musicalKey })
  }, [])

  const reset = useCallback(() => {
    run.current += 1
    setState({ stage: 'idle' })
  }, [])

  return { state, start, reset }
}
