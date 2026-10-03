import { type CSSProperties, type HTMLAttributes, type ReactNode, useEffect } from 'react'
import { cx } from '../forceState'
import { ensureStampNoise } from './noise'
import styles from './Stamp.module.css'

export type StampTone = 'white' | 'red' | 'black'

export interface StampProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  children: ReactNode
  tone?: StampTone
  /**
   * Giro como fracción del máximo (`--bb-tilt-stamp`, 9°): de −1 (−9°) a 1 (+9°). Por defecto, −0,4.
   */
  turn?: number
  /** `sm`: el de las casillas de la rejilla (trazo de 2 px). */
  size?: 'md' | 'sm'
}

/**
 * Sello de goma (guía §3.3): borde de 3 px del color del texto con la máscara de ruido, girado entre
 * −9° y +9°: «SIN VOTAR», «✓ VOTADA 4/5», «AUTORÍA OCULTA», «SELLADA». Es **estado propio** del usuario
 * o de la semana, nunca un dato de la entrada (§1.3).
 */
export function Stamp({
  children,
  tone = 'white',
  turn = -0.4,
  size = 'md',
  className,
  style,
  ...rest
}: StampProps) {
  useEffect(ensureStampNoise, [])
  const clamped = Math.max(-1, Math.min(1, turn))
  return (
    <span
      {...rest}
      className={cx(styles.stamp, styles[tone], size === 'sm' && styles.sm, className)}
      style={{ ...style, '--stamp-turn': clamped } as CSSProperties}
      data-stamp={tone}
    >
      {children}
    </span>
  )
}
