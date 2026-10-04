import { type CSSProperties, useMemo, useRef } from 'react'
import { t } from '../../i18n'
import { cx } from '../forceState'
import { useElementWidth } from '../hooks/useElementWidth'
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

export interface WaveformProps {
  peaks: readonly WaveformPeak[]
  /** Parte reproducida, en `[0, 1]`: esas barras pasan de gris a rojo. */
  progress?: number
  /** Alto en píxeles CSS (por defecto 48; la mini onda de las filas usa 24). */
  height?: number
  /** Cabeza de lectura blanca con halo en el punto de `progress` (si está entre 0 y 1). */
  playhead?: boolean
  /**
   * Crecimiento desde el centro al montar (Anexo E). Sin movimiento, aparece entera. En una lista (la
   * mini onda de las filas) no aporta: va apagado.
   */
  animateIn?: boolean
  /** Decorativa: fuera del árbol de accesibilidad (p. ej. cuando su fila ya dice qué suena). */
  decorative?: boolean
  className?: string
}

/**
 * Forma de onda visual (§3.3): barras de 2 px con 1 px de hueco a partir de los picos mín/máx, en gris
 * `--bb-wave-idle` y en rojo lo ya reproducido, con cabeza de lectura. Se dibuja en SVG, que es
 * nítido a cualquier densidad de píxeles, con tantas barras como caben en su ancho.
 *
 * Solo pinta: el salto con clic y teclado (y la previsualización al pasar el ratón) llegan con el
 * reproductor en la Fase 5.
 */
export function Waveform({
  peaks,
  progress = 0,
  height = 48,
  playhead = true,
  animateIn = true,
  decorative = false,
  className,
}: WaveformProps) {
  const ref = useRef<HTMLDivElement>(null)
  const width = useElementWidth(ref)
  // Sin medida (antes de maquetar, o en jsdom) se dibuja un pico por barra.
  const count = width > 0 ? barsForWidth(width) : Math.max(1, peaks.length)
  const bars = useMemo(() => resamplePeaks(peaks, count), [peaks, count])
  const fraction = clamp01(progress)
  const played = playedBars(bars.length, fraction)
  const svgWidth = Math.max(WAVE_BAR_WIDTH, bars.length * WAVE_BAR_STEP - 1)
  const middle = height / 2
  const percent = Math.round(fraction * 100)

  const a11y = decorative
    ? { 'aria-hidden': true }
    : {
        role: 'img',
        'aria-label': percent > 0 ? t('ui.waveform.progress', { percent }) : t('ui.waveform.label'),
      }

  return (
    <div
      ref={ref}
      className={cx(styles.waveform, animateIn && styles.animated, className)}
      style={{ height }}
      data-progress={percent}
      {...a11y}
    >
      <svg
        className={styles.svg}
        width={svgWidth}
        height={height}
        viewBox={`0 0 ${svgWidth} ${height}`}
        shapeRendering="crispEdges"
        aria-hidden="true"
        focusable="false"
        // Barras de la onda: lo que dura el barrido de la entrada (2 ms por barra, Anexo E).
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
      {playhead && fraction > 0 && fraction < 1 && (
        <span
          className={styles.playhead}
          style={{ left: Math.min(svgWidth - 1, played * WAVE_BAR_STEP - 1) }}
          aria-hidden="true"
          data-playhead=""
        />
      )}
    </div>
  )
}
