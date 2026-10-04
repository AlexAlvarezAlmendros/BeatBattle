import { useRef } from 'react'
import { cx } from '../forceState'
import { useFitText } from '../hooks/useFitText'
import { Tag } from '../Tag'
import styles from './Announcer.module.css'

export interface AnnouncerProps {
  /** Una a tres palabras en mayúsculas con exclamación («¡VOTO GUARDADO!», «RONDA 01»; §3.9). */
  text: string
  /** `display` (blanco con extrusión y contorno) o `tag` (etiqueta grande girada −6°). */
  variant?: 'display' | 'tag'
  /**
   * Tono de la etiqueta girada (`variant="tag"`), los de `Tag` con texto negro. Como en la maqueta
   * `03-jurado`: blanca para lo que invita («¡A ESCUCHAR!») y roja para lo que confirma
   * («¡VOTO GUARDADO!»).
   */
  tone?: 'white' | 'red'
  /** Sin la región viva (la galería, que enseña varios a la vez). */
  silent?: boolean
  className?: string
}

/**
 * Anunciador (guía §3.3, §3.9): un rótulo de una a tres palabras en display, blanco con extrusión de
 * trama y contorno, o la etiqueta grande girada −6° (blanca o roja, `tone`). **Uno por evento**, nunca encadenados, y repetido
 * en una región viva educada. Es espectáculo: el modo serio lo quita (`data-fx`) y deja la región viva.
 * Entra estampado (escala 1,12 → 1, `--bb-dur-slam`); sin movimiento, aparece montado.
 *
 * Ocupa el ancho de su caja y centra el rótulo. El de display se ajusta a ese ancho (`useFitText`, como
 * el alias de la ficha): en una pantalla estrecha o con un rótulo largo («¡JURADO COMPLETO!» a 320 px)
 * baja la anchura de Anybody y después el cuerpo antes que salirse; la etiqueta girada parte por
 * palabras. Un relleno lateral deja sitio a la sombra dura y a la cursiva, que pintan fuera de los
 * glifos.
 *
 * Los textos salen de `ann.*` (§3.9); nunca los prohibidos («FIGHT!», «K.O.»…).
 */
export function Announcer({
  text,
  variant = 'display',
  tone = 'white',
  silent = false,
  className,
}: AnnouncerProps) {
  const wordRef = useRef<HTMLParagraphElement>(null)
  useFitText(wordRef, variant === 'display' ? text : '')
  return (
    <div className={cx(styles.announcer, className)} data-announcer={variant}>
      <div className={styles.visual} data-fx="" aria-hidden="true">
        {variant === 'tag' ? (
          <span className={styles.tilted}>
            <Tag tone={tone} size="lg" className={styles.tag}>
              {text}
            </Tag>
          </span>
        ) : (
          <p ref={wordRef} className={cx('bb-display', styles.word)}>
            {text}
          </p>
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
