import { type CSSProperties, type KeyboardEvent, type PointerEvent, useMemo, useRef, useState } from 'react'
import { formatDuration, t } from '../../i18n'
import { cx, forceStateAttr, type InteractionState } from '../forceState'
import { useElementWidth } from '../hooks/useElementWidth'
import { Icon } from '../Icon'
import {
  barsForWidth,
  clamp01,
  playedBars,
  resamplePeaks,
  WAVE_BAR_STEP,
  WAVE_BAR_WIDTH,
  type WaveformPeak,
} from './peaks'
import styles from './Waveform.module.css'

/** Salto de las flechas en segundos (§3.3, `RF-PLAY-06`: «←/→ 5 s»). */
export const SEEK_STEP_S = 5

export interface WaveformProps {
  peaks: readonly WaveformPeak[]
  /** Parte reproducida, en `[0, 1]`: esas barras pasan a rojo. */
  progress?: number
  /** Alto en píxeles CSS (por defecto 48; la mini onda de las filas usa 24). */
  height?: number
  /** Cabeza de lectura blanca con halo en el punto de `progress` (si está entre 0 y 1). */
  playhead?: boolean
  /** Crecimiento desde el centro al montar (Anexo E). En una lista no aporta: va apagado. */
  animateIn?: boolean
  /** Decorativa: fuera del árbol de accesibilidad (cuando su pieza ya dice qué suena). */
  decorative?: boolean
  /**
   * Con `onSeek` la onda es un control (`role="slider"`): clic o arrastre para saltar, ←/→ 5 s e
   * Inicio/Fin (`RF-PLAY-06`). Recibe la fracción de destino en `[0, 1]`.
   */
  onSeek?: (fraction: number) => void
  /** Duración en segundos: el valor del control y su texto («0:41 de 2:51»). */
  duration?: number
  /** Marca del umbral de escucha en el Modo Jurado (fracción; «45 s»), con su rótulo. */
  threshold?: { at: number; label: string }
  /** El audio aún no está: barras de esqueleto y `aria-busy`. */
  loading?: boolean
  /** No se puede saltar (p. ej. la entrada aún se procesa): 45 % y `aria-disabled`. */
  disabled?: boolean
  /** La onda no ha cargado: el aviso en su lugar. */
  error?: string
  /** Estado forzado para la galería. */
  state?: InteractionState
  className?: string
}

/**
 * Forma de onda (guía §3.3): barras de 3 px con 2 px de hueco; lo reproducido en `--bb-red` y el resto
 * en `--bb-wave-idle`; cabeza blanca de 2 px con halo de 6 px. Se dibuja en SVG (nítido a cualquier
 * densidad), con tantas barras como caben en su ancho.
 *
 * Sin `onSeek` es una imagen (o decorativa). Con `onSeek`, un control deslizante: hover enseña dónde
 * caería el salto, el foco es el contorno genérico y al pulsar se ve el punto. En el Modo Jurado lleva
 * la marca del umbral («45 s») y la nota de que saltar con la onda no cuenta (la pone su pantalla).
 */
export function Waveform({
  peaks,
  progress = 0,
  height = 48,
  playhead = true,
  animateIn = true,
  decorative = false,
  onSeek,
  duration = 0,
  threshold,
  loading = false,
  disabled = false,
  error,
  state,
  className,
}: WaveformProps) {
  const ref = useRef<HTMLDivElement>(null)
  const width = useElementWidth(ref)
  const [hover, setHover] = useState<number | null>(null)
  const [pressed, setPressed] = useState(false)
  // Sin medida (antes de maquetar, o en jsdom) se dibuja un pico por barra.
  const count = width > 0 ? barsForWidth(width) : Math.max(1, peaks.length)
  const bars = useMemo(() => resamplePeaks(peaks, count), [peaks, count])
  const fraction = clamp01(progress)
  const played = loading ? 0 : playedBars(bars.length, fraction)
  const svgWidth = Math.max(WAVE_BAR_WIDTH, bars.length * WAVE_BAR_STEP - 2)
  const middle = height / 2
  const percent = Math.round(fraction * 100)
  const interactive = Boolean(onSeek) && !error

  if (error) {
    return (
      <div className={cx(styles.waveform, styles.failed, className)} style={{ height }} role="alert">
        <Icon name="alert" className={styles.alert} />
        <span>{error}</span>
      </div>
    )
  }

  const fractionAt = (clientX: number) => {
    const box = ref.current?.getBoundingClientRect()
    if (!box || box.width === 0) return 0
    return clamp01((clientX - box.left) / box.width)
  }
  const seek = (target: number) => {
    if (!disabled && !loading) onSeek?.(clamp01(target))
  }
  const stepFraction = duration > 0 ? SEEK_STEP_S / duration : 0.05

  const control = interactive
    ? {
        role: 'slider',
        tabIndex: 0,
        'aria-label': t('ui.waveform.seek'),
        'aria-valuemin': 0,
        'aria-valuemax': Math.round(duration),
        'aria-valuenow': Math.round(fraction * duration),
        'aria-valuetext': t('ui.waveform.position', {
          time: formatDuration(fraction * duration),
          total: formatDuration(duration),
        }),
        'aria-disabled': disabled || loading || undefined,
        'aria-busy': loading || undefined,
        onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
          const keys: Record<string, number> = {
            ArrowRight: fraction + stepFraction,
            ArrowUp: fraction + stepFraction,
            ArrowLeft: fraction - stepFraction,
            ArrowDown: fraction - stepFraction,
            Home: 0,
            End: 1,
          }
          const target = keys[event.key]
          if (target === undefined) return
          event.preventDefault()
          seek(target)
        },
        onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
          if (disabled || loading) return
          event.currentTarget.setPointerCapture?.(event.pointerId)
          setPressed(true)
          seek(fractionAt(event.clientX))
        },
        onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
          const at = fractionAt(event.clientX)
          setHover(at)
          if (pressed) seek(at)
        },
        onPointerUp: () => setPressed(false),
        onPointerCancel: () => setPressed(false),
        onPointerLeave: () => {
          setHover(null)
          setPressed(false)
        },
      }
    : decorative
      ? { 'aria-hidden': true }
      : {
          role: 'img',
          'aria-label': percent > 0 ? t('ui.waveform.progress', { percent }) : t('ui.waveform.label'),
          'aria-busy': loading || undefined,
        }

  const forcedHover = state === 'hover' ? 0.62 : null
  const preview = forcedHover ?? (interactive && !disabled && !loading ? hover : null)

  return (
    <div
      ref={ref}
      className={cx(
        styles.waveform,
        animateIn && !loading && styles.animated,
        interactive && styles.interactive,
        loading && styles.loading,
        disabled && styles.disabled,
        (pressed || state === 'pressed') && styles.pressed,
        className,
      )}
      style={{ height }}
      data-progress={percent}
      {...forceStateAttr(state)}
      {...control}
    >
      <svg
        className={styles.svg}
        width={svgWidth}
        height={height}
        viewBox={`0 0 ${svgWidth} ${height}`}
        shapeRendering="crispEdges"
        aria-hidden="true"
        focusable="false"
        // Lo que dura el barrido de la entrada (2 ms por barra, Anexo E).
        style={{ '--wave-bars': bars.length } as CSSProperties}
      >
        {bars.map(([min, max], i) => {
          // Al menos 2 px de alto: el silencio se ve como una línea, no como un hueco.
          const top = Math.min(middle - 1, middle - max * middle)
          const barHeight = Math.max(2, (max - min) * middle)
          return (
            <rect
              // biome-ignore lint/suspicious/noArrayIndexKey: la barra i es siempre la misma posición
              key={i}
              className={i < played ? styles.played : styles.bar}
              x={i * WAVE_BAR_STEP}
              y={top}
              width={WAVE_BAR_WIDTH}
              height={barHeight}
            />
          )
        })}
      </svg>
      {threshold && (
        <span
          className={styles.threshold}
          style={{ left: `${clamp01(threshold.at) * 100}%` }}
          data-threshold=""
          aria-hidden="true"
        >
          <span className={styles.thresholdLabel}>{threshold.label}</span>
        </span>
      )}
      {preview !== null && (
        <span className={styles.preview} style={{ left: `${preview * 100}%` }} aria-hidden="true" />
      )}
      {playhead && !loading && fraction > 0 && fraction < 1 && (
        <span
          className={styles.playhead}
          style={{ left: Math.min(svgWidth - 1, played * WAVE_BAR_STEP - 1) }}
          aria-hidden="true"
          data-playhead=""
        />
      )}
      {loading && <span className="sr-only">{t('ui.skeleton.loading')}</span>}
    </div>
  )
}
