import { color, font, logo } from '@beatbattle/shared/tokens'
import { type CSSProperties, useEffect, useRef } from 'react'
import { t } from '../../i18n'
import { cx } from '../forceState'
import styles from './GameLogo.module.css'

interface LogoLine {
  key: 'beat' | 'battle'
  x: number
  y: number
  size: number
  /** Ancho al que se ajusta la palabra (el `textLength` de las maquetas): el logo mide siempre igual. */
  length: number
  red: boolean
}

interface LogoLayout {
  /** Caja del lienzo en unidades del logo: origen y tamaño (el `viewBox` de las maquetas). */
  box: readonly [x: number, y: number, width: number, height: number]
  lines: readonly LogoLine[]
  speedLines: boolean
}

/** Composición en dos líneas (la de la pantalla de título y del menú) y en una (móvil bajo). */
export const LOGO_LAYOUTS = {
  full: {
    box: [-20, -10, logo.canvas, 440],
    lines: [
      { key: 'beat', x: 392, y: 168, size: 168, length: 560, red: true },
      { key: 'battle', x: 24, y: 384, size: 214, length: 940, red: false },
    ],
    speedLines: true,
  },
  compact: {
    // 30 unidades más ancho que el `viewBox` de la maqueta: el SVG dejaba salir la cursiva y el contorno
    // de «BATTLE» por la derecha, y el canvas los recortaría.
    box: [-20, -10, 1330, 190],
    lines: [
      { key: 'beat', x: 0, y: 150, size: 168, length: 470, red: true },
      { key: 'battle', x: 500, y: 150, size: 168, length: 760, red: false },
    ],
    speedLines: false,
  },
} satisfies Record<string, LogoLayout>

/**
 * Proporción (ancho / alto) del lienzo de una composición: la que el logo expone en `--game-logo-aspect`,
 * para quien lo dimensiona por el alto (el menú con la ventana baja, §3.8.3).
 */
export function logoAspect(compact = false): number {
  const [, , width, height] = (compact ? LOGO_LAYOUTS.compact : LOGO_LAYOUTS.full).box
  return width / height
}

/** Líneas de velocidad detrás de «BEAT» (unidades del logo): alto, inicio y color. */
const SPEED_LINES = [
  { y: 46, h: 18, x0: 150, white: true },
  { y: 76, h: 34, x0: 40, white: false },
  { y: 122, h: 12, x0: 214, white: true },
  { y: 142, h: 22, x0: 96, white: false },
] as const
const SPEED_END = 470
/** Trazo de la cara de las letras (unidades del logo), bajo el relleno. */
const FACE_STROKE = 5
/** Altura (fracción) del corte duro del degradado de la cara, como en la maqueta. */
const FACE_SPLIT = 0.52
/** Trama de relleno de la extrusión (§3.2 «Texturas»): celda y punto en unidades del logo. */
const FILL_CELL = 8
const FILL_DOT = 2.3
const MAX_DPR = 2

/** La fuente del display a un tamaño, para el contexto 2D (cursiva 900; la anchura va aparte). */
const displayFont = (size: number) => `italic 900 ${size}px ${font.display}`

function fillPattern(ctx: CanvasRenderingContext2D, scale: number): CanvasPattern | string {
  const tile = document.createElement('canvas')
  const side = Math.max(1, Math.round(FILL_CELL * scale))
  tile.width = side
  tile.height = side
  const tileCtx = tile.getContext('2d')
  if (!tileCtx) return color.redCta
  tileCtx.fillStyle = color.redCta
  tileCtx.fillRect(0, 0, side, side)
  tileCtx.fillStyle = color.redShade
  tileCtx.beginPath()
  tileCtx.arc(side / 2, side / 2, FILL_DOT * scale, 0, Math.PI * 2)
  tileCtx.fill()
  const pattern = ctx.createPattern(tile, 'repeat')
  if (!pattern) return color.redCta
  // El patrón se dibuja en el espacio del logo: se deshace la escala para que la celda mida 8 unidades.
  pattern.setTransform(new DOMMatrix().scale(1 / scale))
  return pattern
}

/**
 * Pinta el logo en un contexto ya transformado a unidades del logo: es el `logo()` de las maquetas
 * aprobadas (`final.js`) con la API del canvas. El contorno negro de 8 unidades y el filete blanco de 3
 * (las dilataciones del filtro de la maqueta) son trazos de toda la pila de capas; luego la extrusión de
 * 12 capas desplazadas (0,9; 1,1) con la trama de relleno, y encima la cara con su degradado.
 */
function paintLogo(
  ctx: CanvasRenderingContext2D,
  layout: LogoLayout,
  scale: number,
  words: Record<string, string>,
) {
  const [bx, by, bw, bh] = layout.box
  ctx.clearRect(bx, by, bw, bh)
  ctx.lineJoin = 'round'
  ctx.fontStretch = 'extra-expanded' // 150 % (`--bb-stretch-display`)

  if (layout.speedLines) {
    ctx.save()
    ctx.globalAlpha = 0.95
    for (const bar of SPEED_LINES) {
      const shift = bar.h * 0.42
      const gradient = ctx.createLinearGradient(bar.x0, 0, SPEED_END + shift, 0)
      gradient.addColorStop(0, 'transparent')
      gradient.addColorStop(bar.white ? 0.55 : 0.45, bar.white ? color.white : color.red)
      gradient.addColorStop(1, bar.white ? color.white : color.red)
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.moveTo(bar.x0 + shift, bar.y)
      ctx.lineTo(SPEED_END + shift, bar.y)
      ctx.lineTo(SPEED_END, bar.y + bar.h)
      ctx.lineTo(bar.x0, bar.y + bar.h)
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()
  }

  /** Dibuja cada palabra ajustada a su ancho, desplazada `dx, dy`, con `draw` (trazo o relleno). */
  const eachWord = (dx: number, dy: number, draw: (word: string, line: LogoLine) => void) => {
    for (const line of layout.lines) {
      const word = words[line.key] ?? ''
      ctx.font = displayFont(line.size)
      const natural = ctx.measureText(word).width || line.length
      ctx.save()
      ctx.translate(line.x + dx, line.y + dy)
      ctx.scale(line.length / natural, 1)
      draw(word, line)
      ctx.restore()
    }
  }
  const layers = Array.from({ length: logo.depth + 1 }, (_, index) => logo.depth - index)
  const offset = (layer: number) => [layer * logo.stepX, layer * logo.stepY] as const

  // Filete blanco y contorno negro de toda la pila (la dilatación del filtro de la maqueta).
  for (const [width, stroke] of [
    [2 * (logo.outline + logo.rim), color.white],
    [2 * logo.outline, color.black],
  ] as const) {
    ctx.lineWidth = width
    ctx.strokeStyle = stroke
    for (const layer of layers) eachWord(...offset(layer), (word) => ctx.strokeText(word, 0, 0))
  }

  // Extrusión: 12 capas con la trama de relleno, de atrás adelante.
  ctx.fillStyle = fillPattern(ctx, scale)
  for (const layer of layers.slice(0, -1)) eachWord(...offset(layer), (word) => ctx.fillText(word, 0, 0))

  // Cara: trazo negro debajo y degradado con el corte duro a media altura.
  ctx.lineWidth = FACE_STROKE
  ctx.strokeStyle = color.black
  eachWord(0, 0, (word, line) => {
    const metrics = ctx.measureText(word)
    const top = -metrics.actualBoundingBoxAscent
    const bottom = metrics.actualBoundingBoxDescent
    const gradient = ctx.createLinearGradient(0, top, 0, bottom)
    const [lightTop, top52, bottom52, lightBottom] = line.red
      ? ([color.faceRedTint, color.red, color.faceRedShade, color.faceRedMid] as const)
      : ([color.white, color.white, color.faceWhiteShade, color.faceWhiteTint] as const)
    gradient.addColorStop(0, lightTop)
    gradient.addColorStop(FACE_SPLIT, top52)
    gradient.addColorStop(FACE_SPLIT, bottom52)
    gradient.addColorStop(1, lightBottom)
    ctx.strokeText(word, 0, 0)
    ctx.fillStyle = gradient
    ctx.fillText(word, 0, 0)
  })
}

export interface GameLogoProps {
  /** Una sola línea (móvil bajo, §3.8.3). */
  compact?: boolean
  className?: string
}

/**
 * Logo del juego «BEAT BATTLE» (guía §3.2 «Trazos», §3.5, §3.8.1): Anybody cursiva 900 al 150 %, «BEAT»
 * en rojo y «BATTLE» en blanco, con contorno negro de 8 unidades y filete blanco exterior de 3 sobre un
 * lienzo de 1040 de ancho, extrusión de 12 capas desplazadas (0,9; 1,1) rellena de trama y líneas de
 * velocidad. Es el `logo()` de las maquetas aprobadas pintado en un **canvas 2D**, que no es candidato a
 * LCP: el LCP de la home tiene que ser un texto (`RNF-PERF-02`, §3.5), y el SVG con `<text>` lo era. Se
 * pinta cuando la fuente del display está lista (sin un fotograma con la de reserva), y de nuevo al
 * cambiar de tamaño o de DPR. Decorativo: el nombre del juego lo lleva el `<h1>` de la pantalla.
 *
 * Mide lo que le dé de ancho quien lo usa; su proporción (ancho / alto del lienzo de su composición) va en
 * `--game-logo-aspect`, para quien lo quiera dimensionar por el alto (el menú con la ventana baja, §3.8.3).
 */
export function GameLogo({ compact = false, className }: GameLogoProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const layout = compact ? LOGO_LAYOUTS.compact : LOGO_LAYOUTS.full
  const words = { beat: t('ui.gameLogo.beat'), battle: t('ui.gameLogo.battle') }
  const wordsKey = `${words.beat}|${words.battle}`

  // biome-ignore lint/correctness/useExhaustiveDependencies: `words` sale de `wordsKey`
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || typeof ResizeObserver === 'undefined') return
    let active = true
    let painted = ''
    let ready = false
    const paint = () => {
      const width = canvas.clientWidth
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      const key = `${width}@${dpr}`
      if (!ready || width === 0 || key === painted) return
      painted = key
      const [bx, by, bw, bh] = layout.box
      const scale = (width / bw) * dpr
      canvas.width = Math.round(bw * scale)
      canvas.height = Math.round(bh * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(scale, 0, 0, scale, -bx * scale, -by * scale)
      paintLogo(ctx, layout, scale, words)
    }
    const observer = new ResizeObserver(paint)
    observer.observe(canvas)
    const sizes = [...new Set(layout.lines.map((line) => line.size))]
    void Promise.all(
      sizes.map((size) => document.fonts?.load(`italic 900 extra-expanded ${size}px ${font.display}`)),
    )
      .catch(() => undefined)
      .then(() => {
        if (!active) return
        ready = true
        paint()
      })
    return () => {
      active = false
      observer.disconnect()
    }
  }, [layout, wordsKey])

  const aspect = { '--game-logo-aspect': logoAspect(compact) } as CSSProperties
  return (
    <span
      className={cx(styles.logo, className)}
      style={aspect}
      aria-hidden="true"
      data-game-logo={compact ? 'compact' : 'full'}
    >
      <canvas ref={ref} className={styles.canvas} />
    </span>
  )
}
