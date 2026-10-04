import { type CSSProperties, useLayoutEffect, useRef, useState } from 'react'
import { cx } from '../forceState'
import { useReducedMotion } from '../hooks/useReducedMotion'
import styles from './Meter.module.css'

/** Estado forzado para la galería: el brillo que recorre el relleno al subir. */
export type MeterState = 'rest' | 'gain'

export interface MeterProps {
  value: number
  min?: number
  max: number
  /** Nombre accesible («Experiencia», «Escucha»). */
  label: string
  /** El valor en palabras para los lectores de pantalla («2.980 de 3.350 XP para el nivel 8»). */
  valueText: string
  /** El valor en texto a la vista, a los dos extremos («XP 2.980» · «NV 8 · 3.350»). */
  caption?: { start: string; end?: string }
  /** `meter` (un valor dentro de un rango: XP, escucha) o `progressbar` (algo que avanza y termina). */
  role?: 'meter' | 'progressbar'
  /** Ancho CSS de la pista (por defecto, todo el de su sitio). */
  width?: CSSProperties['width']
  state?: MeterState
  className?: string
}

/**
 * Medidor (guía §3.3; XP, escucha, combo, semana): paralelogramo segmentado (segmentos de 9 px con
 * hueco negro de 2 px), pista `--bb-ink-4` y relleno `--bb-red`, como el del HUD de las maquetas.
 * Siempre con su valor en texto (`caption` a la vista y `aria-valuetext`) y con su rol (`meter` o
 * `progressbar`). Al subir, un brillo lo recorre una vez (sin movimiento, solo cambia el relleno;
 * Anexo E). Lleno, `data-full` (el estado de éxito de §3.3).
 */
export function Meter({
  value,
  min = 0,
  max,
  label,
  valueText,
  caption,
  role = 'meter',
  width,
  state,
  className,
}: MeterProps) {
  const reduced = useReducedMotion()
  const span = max - min
  const ratio = span > 0 ? Math.min(1, Math.max(0, (value - min) / span)) : 1
  const [shine, setShine] = useState(0)
  const previous = useRef(value)

  useLayoutEffect(() => {
    if (!reduced && value > previous.current) setShine((key) => key + 1)
    previous.current = value
  }, [value, reduced])

  // El rol es `meter` o `progressbar`: los dos llevan nombre y valores (en un objeto, porque el rol es
  // una variable y el lint de JSX no sabe que los dos admiten `aria-label`).
  const a11y = {
    role,
    'aria-label': label,
    'aria-valuemin': min,
    'aria-valuemax': max,
    'aria-valuenow': Math.min(Math.max(value, min), max),
    'aria-valuetext': valueText,
  }

  return (
    <div
      className={cx(styles.meter, className)}
      style={{ '--meter-width': width, '--meter-ratio': ratio } as CSSProperties}
      data-full={ratio >= 1 || undefined}
      data-force-state={state === 'gain' ? 'gain' : undefined}
    >
      <div className={styles.track} {...a11y}>
        <div className={styles.fill} data-meter-fill="">
          {(shine > 0 || state === 'gain') && <span key={shine} className={styles.shine} />}
        </div>
      </div>
      {caption && (
        <div className={styles.caption} aria-hidden="true">
          <span>{caption.start}</span>
          {caption.end && <span>{caption.end}</span>}
        </div>
      )}
    </div>
  )
}
