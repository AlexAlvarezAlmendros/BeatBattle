import { color, font, loopVinylMs } from '@beatbattle/shared/tokens'
import { useEffect, useRef, useState } from 'react'
import { HALFTONE_SHAPES, paintHalftone } from '../arena/halftone'
import { cx } from '../forceState'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { useLoops } from '../loops'
import styles from './TitleDisc.module.css'

const MAX_DPR = 2

/** Proporciones de la galleta respecto al lado (maqueta `00-titulo`, disco de 760 px). */
const LABEL = {
  ring: 0.135,
  disc: 0.12,
  title: 34 / 760,
  titleY: -16 / 760,
  sub: 15 / 760,
  subY: 18 / 760,
  hole: 4 / 760,
  holeY: 2 / 760,
}

/** El texto más pequeño que se pinta en la galleta (`RD-VIS-05`: ≥ 12 px). */
const MIN_TEXT_PX = 12

/**
 * Cuerpo del título y de la línea del tempo para un disco de `size` px; `null` si no llega a 12 px
 * (entonces no se pinta: es decorativo y lo repiten los chips; jurado de la 1.12, `RD-VIS-05`).
 */
export function discTextSizes(size: number): { title: number | null; sub: number | null } {
  const px = (ratio: number) => {
    const value = Math.round(size * ratio)
    return value >= MIN_TEXT_PX ? value : null
  }
  return { title: px(LABEL.title), sub: px(LABEL.sub) }
}

/** Pinta el disco: el anillo de trama (forma `titleDisc`) y la galleta roja con la semana y el tempo. */
function paintTitleDisc(ctx: CanvasRenderingContext2D, size: number, label: string, sub: string): void {
  paintHalftone(ctx, size, size, {
    cell: 12,
    angle: 30,
    max: 0.7,
    ink: color.red,
    shape: HALFTONE_SHAPES.titleDisc,
  })
  const center = size / 2
  const tau = Math.PI * 2
  ctx.strokeStyle = color.line
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(center, center, size * LABEL.ring, 0, tau)
  ctx.stroke()
  ctx.fillStyle = color.red
  ctx.beginPath()
  ctx.arc(center, center, size * LABEL.disc, 0, tau)
  ctx.fill()
  ctx.fillStyle = color.black
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const text = discTextSizes(size)
  if (text.title !== null) {
    ctx.font = `italic 900 ${text.title}px ${font.display}`
    ctx.fillText(label, center, center + size * LABEL.titleY)
  }
  if (text.sub !== null) {
    ctx.font = `700 ${text.sub}px ${font.num}`
    ctx.fillText(sub, center, center + size * LABEL.subY)
  }
  ctx.beginPath()
  ctx.arc(center, center + size * LABEL.holeY, size * LABEL.hole, 0, tau)
  ctx.fill()
}

export interface TitleDiscProps {
  /** La galleta («S41»). */
  label: string
  /** La línea pequeña («92 BPM · RE MENOR»). */
  sub: string
  /** Una vuelta por compás al BPM del sample (`loopVinylMs`, §3.6). */
  bpm: number
  className?: string
}

/**
 * El vinilo-sol de la pantalla de título (guía §3.8.1, maqueta `00-titulo`): el disco grande, en trama,
 * que la diagonal corta y que gira una vuelta por compás. Se pinta una vez por tamaño y densidad (por CPU,
 * §3.4.5) y gira en el compositor, en fase con el reloj del documento; sin movimiento o con la pausa de la
 * barra, quieto. Va en la pantalla de título, que está en la capa de encima de todo (por encima del lienzo
 * del Escenario): por eso es un lienzo 2D y no una vista anclada. Decorativo.
 */
export function TitleDisc({ label, sub, bpm, className }: TitleDiscProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const reduced = useReducedMotion()
  const paused = useLoops((state) => state.paused)
  const spin = useRef<Animation | null>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || typeof ResizeObserver === 'undefined') return
    let painted = ''
    const paint = () => {
      const size = canvas.clientWidth
      setShown(size > 0)
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      const key = `${size}@${dpr}`
      if (size === 0 || key === painted) return
      painted = key
      canvas.width = Math.round(size * dpr)
      canvas.height = Math.round(size * dpr)
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      paintTitleDisc(ctx, size, label, sub)
    }
    const observer = new ResizeObserver(paint)
    observer.observe(canvas)
    paint()
    void document.fonts?.ready.then(() => {
      painted = ''
      paint()
    })
    return () => observer.disconnect()
  }, [label, sub])

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || reduced || !shown || typeof canvas.animate !== 'function') return
    const animation = canvas.animate([{ rotate: '0turn' }, { rotate: '1turn' }], {
      duration: loopVinylMs(bpm),
      iterations: Number.POSITIVE_INFINITY,
    })
    animation.startTime = 0
    spin.current = animation
    return () => {
      animation.cancel()
      spin.current = null
    }
  }, [bpm, reduced, shown])

  // biome-ignore lint/correctness/useExhaustiveDependencies: también cuando se crea un giro nuevo
  useEffect(() => {
    if (paused) spin.current?.pause()
    else spin.current?.play()
  }, [paused, bpm, reduced, shown])

  return (
    <span className={cx(styles.disc, className)} aria-hidden="true">
      <canvas ref={ref} className={styles.canvas} data-title-disc="" />
      <span className={styles.rim} />
    </span>
  )
}
