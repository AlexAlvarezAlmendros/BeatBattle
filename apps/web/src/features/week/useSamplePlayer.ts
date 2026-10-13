import { useCallback, useMemo } from 'react'
import type { WaveformPeak } from '../../ui/Waveform'
import { type PlayerTrack, usePlayer } from '../player/store'

export interface SamplePlayer {
  playing: boolean
  /** Posición en segundos. */
  current: number
  /** Fracción escuchada (0–1), para la onda. */
  progress: number
  /** El audio no se ha podido cargar. */
  failed: boolean
  toggle(): void
  seek(fraction: number): void
}

/** Lo que hace falta del sample de una semana para escucharlo. */
export interface SampleSource {
  /** Número de la semana: el mismo sample es la misma pista en el menú y en su página. */
  number: number
  title: string
  credits: string
  streamUrl?: string
  durationSeconds: number
  coverUrl?: string | null
  /** Onda del sample, para la barra del reproductor. */
  peaks?: readonly WaveformPeak[] | null
}

/** La pista del reproductor global para el sample de una semana. */
export function sampleTrack(sample: SampleSource & { streamUrl: string }): PlayerTrack {
  return {
    id: `sample:${sample.number}`,
    kind: 'sample',
    title: sample.title,
    artist: sample.credits,
    streamUrl: sample.streamUrl,
    durationMs: Math.round(sample.durationSeconds * 1000),
    // El sample no es una entrada: suena tal cual y la trama puede reaccionar a él.
    gainDb: null,
    artworkUrl: sample.coverUrl ?? null,
    cover: sample.coverUrl ? { kind: 'url', url: sample.coverUrl } : null,
    peaks: sample.peaks ?? null,
    blind: false,
    weekSlug: '',
  }
}

/**
 * El sample de la semana en el reproductor global (`RF-DROP-09`: se oye sin cuenta; tarea 5.13): el mismo
 * `<audio>` que las entradas, así que sigue sonando al navegar (`RF-PLAY-01`). Pasa por el bus de música
 * del motor (ducking de efectos y ambiente, `RD-SND-03`) sin `blind`: la trama puede reaccionar a él. Nada
 * suena antes de que la persona pulse play (§3.7.1).
 */
export function useSamplePlayer(sample: SampleSource | null): SamplePlayer {
  const {
    number = 0,
    title = '',
    credits = '',
    streamUrl,
    durationSeconds = 0,
    coverUrl,
    peaks,
  } = sample ?? {}
  const track = useMemo(
    () =>
      streamUrl ? sampleTrack({ number, title, credits, streamUrl, durationSeconds, coverUrl, peaks }) : null,
    [number, title, credits, streamUrl, durationSeconds, coverUrl, peaks],
  )
  const mine = usePlayer((state) => track !== null && state.track?.id === track.id)
  const status = usePlayer((state) => state.status)
  const positionMs = usePlayer((state) => state.positionMs)

  const toggle = useCallback(() => {
    if (!track) return
    const player = usePlayer.getState()
    if (player.track?.id === track.id) player.toggle()
    else player.play(track)
  }, [track])

  const seek = useCallback(
    (fraction: number) => {
      if (!track) return
      const player = usePlayer.getState()
      if (player.track?.id !== track.id) return
      player.seek(Math.min(1, Math.max(0, fraction)) * track.durationMs)
    },
    [track],
  )

  const current = mine ? positionMs / 1000 : 0
  const total = durationSeconds
  return {
    playing: mine && (status === 'playing' || status === 'loading'),
    current,
    progress: total > 0 ? Math.min(1, current / total) : 0,
    failed: mine && status === 'error',
    toggle,
    seek,
  }
}
