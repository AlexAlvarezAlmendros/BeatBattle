import type { HTMLAttributes, ReactNode } from 'react'
import { useTilt } from '../../hooks/useTilt'
import { cx, forceStateAttr } from '../forceState'
import styles from './Card.module.css'

export type CardSurface = 'glass' | 'solid'
export type CardState = 'rest' | 'hover' | 'focus'

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Elemento raíz (por defecto `<article>`). */
  as?: 'article' | 'div' | 'section' | 'li'
  /**
   * `glass` (por defecto): cristal como las tarjetas de la home del sello. `solid`: `--bb-ink-800` sin
   * desenfoque, para listas largas y calidad baja (§3.3).
   */
  surface?: CardSurface
  /** Inclinación 3D al pasar el ratón (por defecto, sí; se apaga sola sin movimiento o en táctil). */
  tilt?: boolean
  /** Estado forzado para la galería. */
  state?: CardState
  children: ReactNode
}

/**
 * Tarjeta (§3.3): cristal (`--bb-glass-card` + desenfoque, borde `--bb-line-strong`, radio 16 y la
 * sombra con filete interior medida en el sello) o maciza. Con ratón se inclina hasta 6° con un brillo
 * especular que sigue al cursor (`useTilt`, portado del sello); con «reducir movimiento» o puntero
 * táctil no se mueve y en su lugar se le ilumina el borde (Anexo E).
 */
export function Card({
  as: Tag = 'article',
  surface = 'glass',
  tilt: tiltEnabled = true,
  state,
  className,
  children,
  ...rest
}: CardProps) {
  const tilt = useTilt<HTMLElement>({ disabled: !tiltEnabled })
  return (
    <Tag
      {...rest}
      ref={tilt.ref as never}
      className={cx(styles.card, surface === 'glass' ? styles.glass : styles.solid, className)}
      data-surface={surface}
      data-tilt={tilt.enabled ? 'on' : 'off'}
      {...forceStateAttr(state)}
      {...tilt.handlers}
    >
      {children}
      <span className={styles.glare} aria-hidden="true" />
    </Tag>
  )
}
