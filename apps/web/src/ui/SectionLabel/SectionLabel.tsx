import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from '../forceState'
import styles from './SectionLabel.module.css'

export interface SectionLabelProps extends HTMLAttributes<HTMLHeadingElement> {
  /** Nivel de encabezado (por defecto `h2`) o `p` si no abre sección. */
  as?: 'h2' | 'h3' | 'h4' | 'p'
  children: ReactNode
}

/**
 * Rótulo de sección (§3.3): barra roja de 3×12 px y mayúsculas pequeñas espaciadas, como
 * «▌INFORMACIÓN» en la ficha de beat del sello. Texto en `--bb-text-3` (el `#777` del sello no llega
 * a AA sobre tarjeta).
 */
export function SectionLabel({ as: Tag = 'h2', className, children, ...rest }: SectionLabelProps) {
  return (
    <Tag {...rest} className={cx(styles.label, className)}>
      {children}
    </Tag>
  )
}
