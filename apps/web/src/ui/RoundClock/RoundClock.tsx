import { type CSSProperties, Fragment, type ReactNode, useEffect, useRef, useState } from 'react'
import { t } from '../../i18n'
import { Frame } from '../Frame'
import { cx } from '../forceState'
import {
  type CountdownMilestone,
  type CountdownParts,
  countdownParts,
  countdownPhase,
  crossedMilestone,
  msToNextSecond,
  pad2,
} from './countdown'
import styles from './RoundClock.module.css'

/** Días de la semana de batalla, de lunes a domingo (la barra de la semana, §3.3). */
export const WEEK_DAYS = 7

/**
 * La barra de la semana (§3.3): siete segmentos L–D. `today` es el día de hoy (0 = lunes) y `progress`
 * lo que ya ha pasado de él; el domingo, el tramo de solo votos va rayado en rojo.
 */
export interface WeekBar {
  today: number
  progress: number
}

export interface RoundClockProps {
  /** Instante objetivo, UTC en ms. */
  target: number
  /** Fuente de «ahora» (UTC en ms). Inyectable para los tests y la galería; por defecto, `Date.now`. */
  now?: () => number
  /** Rótulo («TIEMPO · CIERRE DE ENVÍOS»), también el nombre accesible del temporizador. */
  label: string
  /** La línea de abajo, con la fecha absoluta en hora de Madrid («Domingo 11 a las 20:00 · …»). */
  when?: ReactNode
  /** La barra de la semana; sin ella, solo los dígitos. */
  week?: WeekBar
  /** `hud` (la caja del centro del HUD) o `inline` (una fila, dentro de la tarjeta de la semana en móvil). */
  variant?: 'hud' | 'inline'
  /** Se llama una vez al llegar a cero. */
  onEnd?: () => void
  className?: string
}

const UNITS = ['days', 'hours', 'minutes', 'seconds'] as const
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

/**
 * Reloj de ronda (guía §3.3; sustituye a la cuenta atrás del sello): caja de marco rojo con su rótulo,
 * `DD:HH:MM:SS` en Oxanium de 34 px con las unidades debajo y separadores rojos, y la barra de la
 * semana. En las últimas 24 h los dígitos van en rojo; en la última hora el marco late a 1 Hz; agotado,
 * «¡TIEMPO!» (el estado de error de §3.3). Sin movimiento, sin latido (Anexo E).
 *
 * Accesibilidad (`RNF-A11Y-07`): `role="timer"` con el tiempo restante en texto y sin anunciarse solo;
 * una región viva aparte avisa únicamente en los hitos de 24 h, 1 h y 10 min, y al acabar.
 */
export function RoundClock({
  target,
  now = Date.now,
  label,
  when,
  week,
  variant = 'hud',
  onEnd,
  className,
}: RoundClockProps) {
  const [current, setCurrent] = useState(() => now())
  const [announcement, setAnnouncement] = useState('')
  const remaining = target - current
  const previousRemaining = useRef(remaining)
  const nowRef = useRef(now)
  nowRef.current = now
  const onEndRef = useRef(onEnd)
  onEndRef.current = onEnd

  // Un temporizador por cambio de cifra, alineado con el segundo del objetivo; se para en cero.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = () => {
      const value = nowRef.current()
      setCurrent(value)
      if (value < target) timer = setTimeout(tick, msToNextSecond(target - value))
    }
    tick()
    return () => clearTimeout(timer)
  }, [target])

  useEffect(() => {
    const milestone = crossedMilestone(previousRemaining.current, remaining)
    previousRemaining.current = remaining
    if (!milestone) return
    setAnnouncement(t(`ui.roundClock.milestone.${milestone satisfies CountdownMilestone}`))
    if (milestone === 'ended') onEndRef.current?.()
  }, [remaining])

  const phase = countdownPhase(remaining)
  const parts = countdownParts(remaining)
  const ended = phase === 'ended'

  return (
    <Frame
      cut="base"
      className={cx(styles.clock, styles[variant], className)}
      data-phase={phase}
      data-variant={variant}
    >
      <div role="timer" aria-label={label} className={styles.timer}>
        <span className="sr-only">{ended ? t('ui.roundClock.ended') : spoken(parts)}</span>
        <p className={styles.label} aria-hidden="true">
          {label}
        </p>
        {ended ? (
          <p className={cx('bb-display', styles.out)} aria-hidden="true">
            {t('ui.roundClock.timeUp')}
          </p>
        ) : (
          <div className={styles.digits} aria-hidden="true">
            {UNITS.map((unit, index) => (
              <Fragment key={unit}>
                {index > 0 && <span className={styles.separator}>{t('ui.roundClock.separator')}</span>}
                <span className={styles.group}>
                  <b>{pad2(parts[unit])}</b>
                  {variant === 'hud' && <small>{t(`ui.roundClock.units.${unit}`)}</small>}
                </span>
              </Fragment>
            ))}
          </div>
        )}
      </div>
      {week && <WeekSegments week={week} labels={variant === 'hud'} />}
      {when && variant === 'hud' && <p className={styles.when}>{when}</p>}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </Frame>
  )
}

/** La barra de la semana: decorativa (lo mismo lo dicen el reloj y su línea de fecha). */
function WeekSegments({ week, labels }: { week: WeekBar; labels: boolean }) {
  return (
    <div className={styles.week} aria-hidden="true">
      {DAYS.map((day, index) => {
        const kind =
          index < week.today
            ? 'past'
            : index === week.today
              ? 'today'
              : index === WEEK_DAYS - 1
                ? 'votes'
                : 'ahead'
        return (
          <span key={day} className={styles.day} data-day={kind}>
            <span
              className={styles.segment}
              data-week-segment=""
              style={
                kind === 'today'
                  ? ({ '--day-progress': `${Math.round(week.progress * 100)}%` } as CSSProperties)
                  : undefined
              }
            />
            {labels && <span className={styles.dayLabel}>{t(`ui.roundClock.days.${day}`)}</span>}
          </span>
        )
      })}
    </div>
  )
}

/** «Tiempo restante: 2 días, 14 horas, 5 minutos y 33 segundos». */
function spoken(parts: CountdownParts): string {
  return t('ui.roundClock.remaining', {
    days: t('ui.roundClock.daysCount', { count: parts.days }),
    hours: t('ui.roundClock.hoursCount', { count: parts.hours }),
    minutes: t('ui.roundClock.minutesCount', { count: parts.minutes }),
    seconds: t('ui.roundClock.secondsCount', { count: parts.seconds }),
  })
}
