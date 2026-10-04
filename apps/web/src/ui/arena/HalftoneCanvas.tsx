import { color } from '@beatbattle/shared/tokens'
import { useEffect, useRef } from 'react'
import { HALFTONE_SHAPES, type HalftoneOptions, type HalftoneShapeName, paintHalftone } from './halftone'

/** DPR máximo al que se pinta: más no se ve y multiplica el coste (§4.17). */
const MAX_DPR = 2

export interface HalftoneCanvasProps extends Omit<HalftoneOptions, 'shape' | 'ink' | 'background'> {
  /** Forma de la trama (de `HALFTONE_SHAPES`). */
  shape: HalftoneShapeName
  /** Tinta (token de color; por defecto, `--bb-red`). */
  ink?: keyof typeof color
  /** Fondo (token de color; por defecto, transparente). */
  background?: keyof typeof color
  className?: string
}

/**
 * Lienzo con la trama de la arena (guía §3.2 «Texturas»): se pinta al montar y cada vez que cambia su
 * tamaño o el DPR, nunca por fotograma. Es decorativo: va siempre dentro de una pieza con `aria-hidden`
 * (un lienzo sin contenido no dice nada a los lectores de pantalla). Sin `ResizeObserver` (jsdom) no
 * pinta: la pieza que lo lleva se ve igual con su color de fondo.
 */
export function HalftoneCanvas({
  shape,
  ink = 'red',
  background,
  className,
  ...options
}: HalftoneCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const { cell, angle, max, min } = options

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || typeof ResizeObserver === 'undefined') return
    let painted = ''
    const paint = () => {
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      const key = `${width}x${height}@${dpr}`
      if (width === 0 || height === 0 || key === painted) return
      painted = key
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      paintHalftone(ctx, width, height, {
        cell,
        angle,
        max,
        min,
        ink: color[ink],
        background: background ? color[background] : undefined,
        shape: HALFTONE_SHAPES[shape],
      })
    }
    const observer = new ResizeObserver(paint)
    observer.observe(canvas)
    paint()
    return () => observer.disconnect()
  }, [shape, ink, background, cell, angle, max, min])

  return <canvas ref={ref} className={className} data-halftone={shape} />
}
