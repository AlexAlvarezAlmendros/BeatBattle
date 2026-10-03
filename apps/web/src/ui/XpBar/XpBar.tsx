import { duration } from '@beatbattle/shared/tokens'
import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { t } from '../../i18n'
import { cx, forceStateAttr } from '../forceState'
import { useReducedMotion } from '../hooks/useReducedMotion'
import styles from './XpBar.module.css'

export type XpBarState = 'rest' | 'gain' | 'levelUp'

export interface XpBarProps {
  /** XP dentro del nivel actual. */
  value: number
  /** XP que hace falta para pasar al siguiente nivel. */
  max: number
  level: number
  /** `md` (8 px, con nivel y cifras) o `sm` (la línea de 2 px del borde de la isla, §3.4.1). */
  size?: 'sm' | 'md'
  /** Nombre accesible (por defecto, «Experiencia»). */
  label?: string
  /** Estado forzado para la galería: brillo a medio recorrido o destello de subida de nivel. */
  state?: XpBarState
  className?: string
}

/**
 * Barra de XP (§3.3): pista `--bb-ink-4`, relleno rojo; al subir, un brillo recorre el relleno; al
 * subir de nivel, se llena, destella una vez y vuelve a empezar desde cero con el nivel nuevo. Con
 * «reducir movimiento», solo el relleno (Anexo E). Es una `progressbar` con sus valores.
 */
export function XpBar({ value, max, level, size = 'md', label, state, className }: XpBarProps) {
  const reduced = useReducedMotion()
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 1
  const [shown, setShown] = useState({ ratio, instant: false })
  const [shineKey, setShineKey] = useState(0)
  const [flashKey, setFlashKey] = useState(0)
  const previous = useRef({ value, level })

  useLayoutEffect(() => {
    const before = previous.current
    previous.current = { value, level }
    if (reduced) {
      setShown({ ratio, instant: false })
      return
    }
    if (level > before.level) {
      // Subida de nivel: llenar, destellar y volver a cero para crecer hasta el valor nuevo.
      setShown({ ratio: 1, instant: false })
      const timer = setTimeout(() => {
        setFlashKey((key) => key + 1)
        setShown({ ratio: 0, instant: true })
      }, duration.reward)
      return () => clearTimeout(timer)
    }
    if (level === before.level && value > before.value) setShineKey((key) => key + 1)
    setShown({ ratio, instant: false })
  }, [value, level, ratio, reduced])

  // Tras el salto a cero (sin transición), el siguiente fotograma crece hasta el valor nuevo.
  useEffect(() => {
    if (!shown.instant) return
    const frame = requestAnimationFrame(() => {
      setShineKey((key) => key + 1)
      setShown({ ratio, instant: false })
    })
    return () => cancelAnimationFrame(frame)
  }, [shown.instant, ratio])

  const forcedLevelUp = state === 'levelUp'
  const fill = forcedLevelUp ? 1 : shown.ratio

  return (
    <div className={cx(styles.xp, styles[size], className)} {...forceStateAttr(state)}>
      {size === 'md' && (
        <div className={styles.labels} aria-hidden="true">
          <span className={styles.level}>{t('ui.xpBar.level', { level })}</span>
          <span className={styles.value}>{t('ui.xpBar.value', { value, max })}</span>
        </div>
      )}
      <div
        className={styles.track}
        role="progressbar"
        aria-label={label ?? t('ui.xpBar.label')}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(value, max)}
        aria-valuetext={t('ui.xpBar.valueText', { value, max, next: level + 1 })}
        data-instant={shown.instant || undefined}
      >
        <div className={styles.fill} style={{ '--xp-ratio': fill } as CSSProperties}>
          {(shineKey > 0 || state === 'gain') && <span key={shineKey} className={styles.shine} />}
        </div>
        {(flashKey > 0 || forcedLevelUp) && <span key={`flash-${flashKey}`} className={styles.flash} />}
      </div>
    </div>
  )
}
