import { cx } from '../forceState'
import { Tag } from '../Tag'
import styles from './Announcer.module.css'

export interface AnnouncerProps {
  /** Una a tres palabras en mayúsculas con exclamación («¡VOTO GUARDADO!», «RONDA 01»; §3.9). */
  text: string
  /** `display` (blanco con extrusión y contorno) o `tag` (etiqueta grande girada −6°). */
  variant?: 'display' | 'tag'
  /** Sin la región viva (la galería, que enseña varios a la vez). */
  silent?: boolean
  className?: string
}

/**
 * Anunciador (guía §3.3, §3.9): un rótulo de una a tres palabras en display, blanco con extrusión de
 * trama y contorno, o la etiqueta grande girada −6°. **Uno por evento**, nunca encadenados, y repetido
 * en una región viva educada. Es espectáculo: el modo serio lo quita (`data-fx`) y deja la región viva.
 * Entra estampado (escala 1,12 → 1, `--bb-dur-slam`); sin movimiento, aparece montado.
 *
 * Los textos salen de `ann.*` (§3.9); nunca los prohibidos («FIGHT!», «K.O.»…).
 */
export function Announcer({ text, variant = 'display', silent = false, className }: AnnouncerProps) {
  return (
    <div className={cx(styles.announcer, className)} data-announcer={variant}>
      <div className={styles.visual} data-fx="" aria-hidden="true">
        {variant === 'tag' ? (
          <span className={styles.tilted}>
            <Tag tone="white" size="lg" className={styles.tag}>
              {text}
            </Tag>
          </span>
        ) : (
          <p className={cx('bb-display', styles.word)}>{text}</p>
        )}
      </div>
      {!silent && (
        <p className="sr-only" role="status" aria-live="polite">
          {text}
        </p>
      )}
    </div>
  )
}
