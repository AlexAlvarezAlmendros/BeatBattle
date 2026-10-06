import { loopVinylMs } from '@beatbattle/shared/tokens'
import { useEffect, useRef, useState } from 'react'
import { useStageView } from '../../stage/runtime'
import { cx } from '../forceState'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { useLoops } from '../loops'
import { paintVinyl } from './paintVinyl'
import styles from './VinylSun.module.css'

const MAX_DPR = 2

/** Sin vista del Escenario: un `ref` que nunca apunta a nada. */
const NO_ANCHOR = { current: null }

export interface VinylSunProps {
  /** Lo que lleva la galleta («S41»). */
  label: string
  /** La línea pequeña («92 BPM»). */
  sub: string
  /** Tempo del sample: una vuelta por compás (`loopVinylMs`, §3.6). */
  bpm: number
  /**
   * Pasa el relevo a una vista del Escenario (§3.5 capa 1, tarea 1.3) cuando lo hay: solo donde la arena
   * está a la vista (la pantalla de título, el banco del Escenario), nunca dentro de un panel opaco.
   * Mientras el Escenario no la pinta, se ve este.
   */
  stage?: boolean
  className?: string
}

/**
 * Vinilo-sol de la semana (guía §3.5 capa 1, §3.8.1, §3.8.3): el sample como un disco de trama roja
 * que gira **una vuelta por compás** al BPM del sample (92 BPM = 2,6 s). Se pinta una vez por tamaño y
 * DPR en un canvas 2D; el giro es una animación de Web Animations sobre el propio lienzo (compuesta,
 * sin repintar). Sin movimiento, quieto (Anexo E). Con la pausa de la barra (WCAG 2.2.2, `ui/loops.ts`)
 * se para donde esté y sigue desde ahí al reanudar. Mientras no se pinta (oculto en móvil), no gira.
 * El giro va en fase con el reloj del documento: todos los vinilos (y la vista del Escenario que lo
 * releva) marcan el mismo punto del compás. Decorativo (`aria-hidden`).
 */
export function VinylSun({ label, sub, bpm, stage = false, className }: VinylSunProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const anchor = useRef<HTMLSpanElement>(null)
  const live = useStageView(stage ? anchor : NO_ANCHOR, { label, sub, bpm })
  const reduced = useReducedMotion()
  const paused = useLoops((state) => state.paused)
  const spinRef = useRef<Animation | null>(null)
  // ¿Se pinta? En móvil el vinilo va oculto (`display: none`): ahí no tiene que girar.
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || typeof ResizeObserver === 'undefined') return
    let painted = ''
    const paint = () => {
      setShown(canvas.clientWidth > 0)
      const size = canvas.clientWidth
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      const key = `${size}@${dpr}`
      if (size === 0 || key === painted) return
      painted = key
      canvas.width = Math.round(size * dpr)
      canvas.height = Math.round(size * dpr)
      // Por CPU, como la textura de la vista del Escenario (y las portadas, §3.4.5): el mismo rasterizado,
      // así que el relevo entre los dos no se nota.
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      paintVinyl(ctx, size, label, sub)
    }
    const observer = new ResizeObserver(paint)
    observer.observe(canvas)
    paint()
    // Las fuentes del display pueden llegar después: se repinta la galleta con ellas.
    void document.fonts?.ready.then(() => {
      painted = ''
      paint()
    })
    return () => observer.disconnect()
  }, [label, sub])

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || reduced || !shown || live || typeof canvas.animate !== 'function') return
    const spin = canvas.animate([{ rotate: '0turn' }, { rotate: '1turn' }], {
      duration: loopVinylMs(bpm),
      iterations: Number.POSITIVE_INFINITY,
    })
    // En fase con el reloj del documento (el de `performance.now()`, que usa el Escenario).
    spin.startTime = 0
    spinRef.current = spin
    return () => {
      spin.cancel()
      spinRef.current = null
    }
  }, [bpm, reduced, shown, live])

  // La pausa para el giro donde esté; al reanudar, sigue desde ahí.
  // biome-ignore lint/correctness/useExhaustiveDependencies: también cuando se crea un giro nuevo (bpm, shown)
  useEffect(() => {
    const spin = spinRef.current
    if (!spin) return
    if (paused) spin.pause()
    else spin.play()
  }, [paused, bpm, reduced, shown, live])

  return (
    <span
      ref={anchor}
      className={cx(styles.vinyl, className)}
      aria-hidden="true"
      data-stage-view={stage ? (live ? 'live' : 'waiting') : undefined}
    >
      <canvas ref={ref} className={styles.canvas} data-vinyl="" />
    </span>
  )
}
