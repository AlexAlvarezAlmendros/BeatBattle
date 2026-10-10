import { coverContext, type PaintedCover, paintCover } from '@beatbattle/covers'
import { useLayoutEffect, useRef } from 'react'
import { cx } from '../forceState'
import styles from './CoverArt.module.css'

export interface GenerativeCoverProps {
  /** Semilla de la entrada (`entry.cover_seed`, `coverSeed(entryId)`): nunca el id del usuario. */
  seed: number | string
  bpm?: number | null
  musicalKey?: string | null
  className?: string
  /** Al terminar de pintar: la medida y el tiempo (ms), para el banco de `/dev/portadas`. */
  onPainted?: (painted: PaintedCover, ms: number) => void
}

/**
 * Portada generativa de una entrada (guía §3.4.5, tarea 4.11): el emblema de su semilla, tonalidad y BPM,
 * pintado **por CPU** (`willReadFrequently`) a su tamaño final en píxeles de pantalla y calibrado por medida
 * con la portada de referencia, para que ninguna destaque por su tinta (`RD-VIS-04`, §1.3). Se repinta si
 * cambia de tamaño. Mientras no hay canvas (o en un entorno sin 2D), queda el fondo común de `CoverArt`.
 * Decorativa (`aria-hidden`): la entrada se nombra por su alias.
 */
export function GenerativeCover({ seed, bpm, musicalKey, className, onPainted }: GenerativeCoverProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const painted = useRef(onPainted)
  painted.current = onPainted

  useLayoutEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    let last = 0
    const paint = () => {
      const size = Math.round(canvas.clientWidth * Math.min(window.devicePixelRatio || 1, 2))
      if (size <= 0 || size === last) return
      last = size
      canvas.width = size
      canvas.height = size
      try {
        const start = performance.now()
        const result = paintCover(coverContext(canvas), size, { seed, bpm, musicalKey })
        painted.current?.(result, performance.now() - start)
      } catch {
        // Sin contexto 2D (p. ej. en jsdom): se queda el fondo común.
      }
    }
    paint()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(paint)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [seed, bpm, musicalKey])

  return (
    // biome-ignore lint/a11y/noAriaHiddenOnFocusable: un <canvas> sin tabindex no recibe el foco; es decorativo
    <canvas ref={ref} className={cx(styles.cover, className)} aria-hidden="true" />
  )
}
