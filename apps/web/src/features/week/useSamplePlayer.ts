import { useCallback, useEffect, useRef, useState } from 'react'
import { audio } from '../../audio/engine'

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

/**
 * El reproductor del sample de la semana (`RF-DROP-09`: se oye sin cuenta). Un `<audio>` con el MP3 de
 * escucha firmado que pasa por el bus de música del motor (ducking de efectos y ambiente, `RD-SND-03`).
 * El sample no es una entrada: va con `blind: false` y la trama puede reaccionar a él. Nada suena antes de
 * que la persona pulse play (§3.7.1).
 */
export function useSamplePlayer(src: string | undefined, durationSeconds: number): SamplePlayer {
  const element = useRef<HTMLAudioElement | null>(null)
  const detach = useRef<(() => void) | null>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!src) return
    const player = new Audio()
    player.crossOrigin = 'anonymous'
    player.preload = 'none'
    player.src = src
    const onTime = () => setCurrent(player.currentTime)
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onError = () => {
      setFailed(true)
      setPlaying(false)
    }
    player.addEventListener('timeupdate', onTime)
    player.addEventListener('play', onPlay)
    player.addEventListener('pause', onPause)
    player.addEventListener('ended', onPause)
    player.addEventListener('error', onError)
    element.current = player
    return () => {
      player.pause()
      player.removeAttribute('src')
      player.load()
      detach.current?.()
      detach.current = null
      element.current = null
      setPlaying(false)
      setCurrent(0)
      setFailed(false)
    }
  }, [src])

  const toggle = useCallback(() => {
    const player = element.current
    if (!player) return
    if (!player.paused) {
      player.pause()
      return
    }
    audio.unlock()
    detach.current ??= audio.attachElement(player, { blind: false })
    void player.play().catch(() => setPlaying(false))
  }, [])

  const seek = useCallback(
    (fraction: number) => {
      const player = element.current
      if (!player) return
      const total =
        Number.isFinite(player.duration) && player.duration > 0 ? player.duration : durationSeconds
      player.currentTime = Math.min(total, Math.max(0, fraction * total))
      setCurrent(player.currentTime)
    },
    [durationSeconds],
  )

  return {
    playing,
    current,
    progress: durationSeconds > 0 ? Math.min(1, current / durationSeconds) : 0,
    failed,
    toggle,
    seek,
  }
}
