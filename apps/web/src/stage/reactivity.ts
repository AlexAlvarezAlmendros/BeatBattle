import { bandEnergy, createReactivity, REACTIVE_BAND_HZ } from '@beatbattle/audio'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { audio } from '../audio/engine'
import { useReducedMotion } from '../ui/hooks/useReducedMotion'
import { useLoops } from '../ui/loops'
import { setAnimating } from './activity'

/** Lo que guarda la depuración (solo en desarrollo): la escala actual y la de los últimos segundos. */
export interface ReactivityStats {
  dotScale: number
  dotScales: { t: number; scale: number }[]
}

/** Muestras de la historia (10 s a 30 fps). */
const HISTORY = 300

/** La trama vuelve al reposo: por debajo de este nivel, quieta y sin fotogramas. */
const REST_LEVEL = 0.002

/** Fps de la trama mientras reacciona (§3.5: la capa 0, a 30 como mucho). */
export const REACTIVE_FPS = 30

/**
 * Reactividad de la arena (guía §3.5 capa 0, tarea 1.6): el bombo y el bajo del bus de música (analizador
 * de FFT 1024 del motor de audio) → paso bajo de 2 Hz → **tamaño de punto** de la trama (`uDotScale`, ≤ 15 %).
 * Nunca la luminancia del rojo ni el brillo de un área grande (`RNF-A11Y-04`). Mientras suena música, la
 * trama pinta a 30 fps; al parar vuelve al reposo y deja de pintar. Con «reducir movimiento» o con la pausa
 * de la barra (WCAG 2.2.2), quieta. Con una entrada sin sellar sonando, también quieta (`RD-MOT-06`, §1.3).
 */
export function useReactiveDots(uniform: { value: number }, stats: ReactivityStats | null): void {
  const reactivity = useMemo(() => createReactivity(), [])
  // Solo la música que se puede leer: con una entrada sin sellar, la trama en reposo (`RD-MOT-06`).
  const [music, setMusic] = useState(audio.musicReactive)
  useEffect(() => {
    setMusic(audio.musicReactive)
    return audio.onMusicChange(() => setMusic(audio.musicReactive))
  }, [])
  const reduced = useReducedMotion()
  const paused = useLoops((state) => state.paused)
  const listening = music && !reduced && !paused
  const bins = useRef<Uint8Array<ArrayBuffer> | null>(null)
  const last = useRef(0)
  const [resting, setResting] = useState(true)

  useEffect(() => {
    setAnimating('reactivity', listening || !resting, REACTIVE_FPS)
  }, [listening, resting])
  useEffect(() => () => setAnimating('reactivity', false), [])

  useFrame(() => {
    const now = performance.now()
    const dt = last.current ? (now - last.current) / 1000 : 0
    last.current = now
    const analyser = audio.musicAnalyser
    let energy = 0
    if (listening && analyser) {
      if (bins.current?.length !== analyser.frequencyBinCount) {
        bins.current = new Uint8Array(analyser.frequencyBinCount)
      }
      analyser.getByteFrequencyData(bins.current)
      energy = bandEnergy(bins.current, analyser.context.sampleRate, analyser.fftSize, REACTIVE_BAND_HZ)
    }
    const scale = reactivity.step(energy, dt)
    uniform.value = scale
    const atRest = !listening && reactivity.level < REST_LEVEL
    if (atRest) {
      reactivity.reset()
      uniform.value = 1
    }
    if (atRest !== resting) setResting(atRest)
    if (stats) {
      stats.dotScale = uniform.value
      stats.dotScales.push({ t: now / 1000, scale: uniform.value })
      if (stats.dotScales.length > HISTORY) stats.dotScales.shift()
    }
  })
}
