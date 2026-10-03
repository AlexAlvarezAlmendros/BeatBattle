import { color, font, loopVinylMs } from '@beatbattle/shared/tokens'
import { useEffect, useRef } from 'react'
import { cx } from '../forceState'
import { useReducedMotion } from '../hooks/useReducedMotion'
import styles from './VinylSun.module.css'

const MAX_DPR = 2

/**
 * Pinta el vinilo-sol (el `vinyl()` de las maquetas, `final.js`): disco negro, trama roja que crece
 * hacia los surcos medios, surcos tenues, galleta roja con la semana y el tempo, y el agujero.
 */
function paintVinyl(ctx: CanvasRenderingContext2D, size: number, label: string, sub: string): void {
  const center = size / 2
  const radius = size / 2
  const tau = Math.PI * 2
  ctx.clearRect(0, 0, size, size)
  ctx.fillStyle = color.black
  ctx.beginPath()
  ctx.arc(center, center, radius - 1, 0, tau)
  ctx.fill()
  const cell = Math.max(5, size / 34)
  ctx.fillStyle = color.red
  for (let y = -radius; y <= radius; y += cell) {
    for (let x = -radius; x <= radius; x += cell) {
      const yy = y + ((Math.round(x / cell) % 2) * cell) / 2
      const distance = Math.hypot(x, yy) / radius
      if (distance > 0.97 || distance < 0.36) continue
      const wave = 0.6 + 0.4 * Math.cos(Math.atan2(yy, x) * 3 + distance * 8)
      const strength = Math.min(
        1,
        Math.max(0, 0.25 + 0.75 * (1 - Math.abs(distance - 0.7) / 0.34) ** 1.2 * wave),
      )
      ctx.beginPath()
      ctx.arc(center + x, center + yy, cell * 0.46 * strength, 0, tau)
      ctx.fill()
    }
  }
  ctx.strokeStyle = color.line
  ctx.lineWidth = 1
  for (let ring = 0.4; ring < 0.97; ring += 0.06) {
    ctx.beginPath()
    ctx.arc(center, center, radius * ring, 0, tau)
    ctx.stroke()
  }
  ctx.fillStyle = color.red
  ctx.beginPath()
  ctx.arc(center, center, radius * 0.32, 0, tau)
  ctx.fill()
  ctx.fillStyle = color.black
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `italic 900 ${Math.round(radius * 0.2)}px ${font.display}`
  ctx.fillText(label, center, center - radius * 0.1)
  ctx.font = `700 ${Math.max(7, Math.round(radius * 0.07))}px ${font.num}`
  ctx.fillText(sub, center, center + radius * 0.14)
  ctx.beginPath()
  ctx.arc(center, center + radius * 0.01, radius * 0.025, 0, tau)
  ctx.fill()
}

export interface VinylSunProps {
  /** Lo que lleva la galleta («S41»). */
  label: string
  /** La línea pequeña («92 BPM»). */
  sub: string
  /** Tempo del sample: una vuelta por compás (`loopVinylMs`, §3.6). */
  bpm: number
  className?: string
}

/**
 * Vinilo-sol de la semana (guía §3.5 capa 1, §3.8.1, §3.8.3): el sample como un disco de trama roja
 * que gira **una vuelta por compás** al BPM del sample (92 BPM = 2,6 s). Se pinta una vez por tamaño y
 * DPR en un canvas 2D; el giro es una animación de Web Animations sobre el propio lienzo (compuesta,
 * sin repintar). Sin movimiento, quieto (Anexo E). Decorativo (`aria-hidden`).
 */
export function VinylSun({ label, sub, bpm, className }: VinylSunProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || typeof ResizeObserver === 'undefined') return
    let painted = ''
    const paint = () => {
      const size = canvas.clientWidth
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      const key = `${size}@${dpr}`
      if (size === 0 || key === painted) return
      painted = key
      canvas.width = Math.round(size * dpr)
      canvas.height = Math.round(size * dpr)
      const ctx = canvas.getContext('2d')
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
    if (!canvas || reduced || typeof canvas.animate !== 'function') return
    const spin = canvas.animate([{ rotate: '0turn' }, { rotate: '1turn' }], {
      duration: loopVinylMs(bpm),
      iterations: Number.POSITIVE_INFINITY,
    })
    return () => spin.cancel()
  }, [bpm, reduced])

  return (
    <span className={cx(styles.vinyl, className)} aria-hidden="true">
      <canvas ref={ref} className={styles.canvas} data-vinyl="" />
    </span>
  )
}
