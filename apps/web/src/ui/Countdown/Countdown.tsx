import { Fragment, useEffect, useRef, useState } from 'react'
import { t } from '../../i18n'
import { cx } from '../forceState'
import styles from './Countdown.module.css'
import {
  type CountdownMilestone,
  type CountdownParts,
  countdownParts,
  countdownPhase,
  crossedMilestone,
  msToNextSecond,
  pad2,
  SECOND_MS,
} from './countdown'

export interface CountdownProps {
  /** Instante objetivo, UTC en ms. */
  target: number
  /** Fuente de «ahora» (UTC en ms). Inyectable para los tests y la galería; por defecto, `Date.now`. */
  now?: () => number
  /** Nombre accesible del temporizador («Cierre de votos»). Por defecto, «Cuenta atrás». */
  label?: string
  size?: 'md' | 'lg'
  /** Se llama una vez al llegar a cero. */
  onEnd?: () => void
  className?: string
}

const UNITS = ['days', 'hours', 'minutes', 'seconds'] as const

/**
 * Cuenta atrás (§3.3), visual: dígitos en mono con persiana por dígito al cambiar, separadores que
 * parpadean a 1 Hz, rojo en las últimas 24 h y latido en la última hora. Sin movimiento, solo cambia
 * el texto (Anexo E).
 *
 * Accesibilidad (RNF-A11Y-07): el temporizador (`role="timer"`) lleva el tiempo restante en texto y no
 * se anuncia solo; una región viva aparte avisa únicamente en los hitos de 24 h, 1 h y 10 min (y al
 * acabar).
 */
export function Countdown({ target, now = Date.now, label, size = 'lg', onEnd, className }: CountdownProps) {
  const [current, setCurrent] = useState(() => now())
  const [announcement, setAnnouncement] = useState('')
  const remaining = target - current
  const previousRemaining = useRef(remaining)
  const nowRef = useRef(now)
  nowRef.current = now
  const onEndRef = useRef(onEnd)
  onEndRef.current = onEnd

  const rootRef = useRef<HTMLDivElement>(null)

  // Un temporizador por cambio de cifra, encadenado y alineado con el segundo del objetivo (un
  // intervalo fijo desde el montaje iba hasta casi 1 s por detrás). Se para al llegar a cero. En
  // cada tick, el parpadeo de los separadores se pone en fase: su ciclo de 1 s empieza en el cambio
  // de cifra, así que el separador está entero cada vez que cambian los dígitos.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = () => {
      const now = nowRef.current()
      setCurrent(now)
      if (rootRef.current) syncBlink(rootRef.current, SECOND_MS - msToNextSecond(target - now))
      if (now < target) timer = setTimeout(tick, msToNextSecond(target - now))
    }
    tick()
    return () => clearTimeout(timer)
  }, [target])

  useEffect(() => {
    const milestone = crossedMilestone(previousRemaining.current, remaining)
    previousRemaining.current = remaining
    if (!milestone) return
    setAnnouncement(t(`ui.countdown.milestone.${milestone satisfies CountdownMilestone}`))
    if (milestone === 'ended') onEndRef.current?.()
  }, [remaining])

  const phase = countdownPhase(remaining)
  const parts = countdownParts(remaining)

  return (
    <div ref={rootRef} className={cx(styles.countdown, styles[size], className)} data-phase={phase}>
      <div role="timer" aria-label={label ?? t('ui.countdown.label')} className={styles.timer}>
        <span className="sr-only">
          {phase === 'ended' ? t('ui.countdown.milestone.ended') : spoken(parts)}
        </span>
        <div className={styles.segments} aria-hidden="true">
          {UNITS.map((unit, index) => (
            <Fragment key={unit}>
              {index > 0 && (
                <span className={styles.separator} data-separator="">
                  :
                </span>
              )}
              <span className={styles.segment}>
                <span className={styles.digits}>
                  {[...pad2(parts[unit])].map((char, position, all) => (
                    // La clave cambia con la cifra: el dígito nuevo se monta y hace su persiana.
                    // biome-ignore lint/suspicious/noArrayIndexKey: la posición (desde la derecha) es parte de la identidad del dígito
                    <span key={`${all.length - position}-${char}`} className={styles.digit}>
                      {char}
                    </span>
                  ))}
                </span>
                <span className={styles.unit}>{t(`ui.countdown.units.${unit}`)}</span>
              </span>
            </Fragment>
          ))}
        </div>
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </div>
  )
}

/**
 * Pone el parpadeo CSS de los separadores en `phaseMs` de su ciclo (Web Animations). Un retardo
 * calculado al montar no basta: la animación arranca cuando el navegador pinta, a veces cientos de ms
 * después (una página pesada), y quedaba en contrafase. Sin la API (jsdom) o sin movimiento (sin
 * animaciones) no hace nada.
 */
function syncBlink(root: HTMLElement, phaseMs: number) {
  if (typeof root.getAnimations !== 'function') return
  for (const separator of root.querySelectorAll<HTMLElement>('[data-separator]')) {
    for (const animation of separator.getAnimations()) animation.currentTime = phaseMs
  }
}

/** «Tiempo restante: 2 días, 14 horas, 5 minutos y 33 segundos». */
function spoken(parts: CountdownParts): string {
  return t('ui.countdown.remaining', {
    days: t('ui.countdown.days', { count: parts.days }),
    hours: t('ui.countdown.hours', { count: parts.hours }),
    minutes: t('ui.countdown.minutes', { count: parts.minutes }),
    seconds: t('ui.countdown.seconds', { count: parts.seconds }),
  })
}
