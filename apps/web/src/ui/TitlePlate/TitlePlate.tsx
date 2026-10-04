import type { HTMLAttributes, ReactNode } from 'react'
import { Frame } from '../Frame'
import { cx } from '../forceState'
import styles from './TitlePlate.module.css'

export interface TitlePlateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Rótulo de arriba («CARTA DE PRODUCTOR»). */
  kicker: ReactNode
  /** Título en display («PERFIL»). */
  title: ReactNode
}

/**
 * Placa de título (guía §3.3): el centro del HUD en las pantallas interiores, un marco blanco con el
 * rótulo y el título en display («CARTA DE PRODUCTOR · PERFIL»). No es un encabezado: el `<h1>` de la
 * pantalla está en su contenido; en el HUD repite el título para la vista y se oculta a los lectores de
 * pantalla con `aria-hidden` (lo pone quien la monta).
 */
export function TitlePlate({ kicker, title, className, ...rest }: TitlePlateProps) {
  return (
    <Frame variant="title" cut="base" {...rest} className={cx(styles.plate, className)}>
      <span className={cx('bb-label', styles.kicker)}>{kicker}</span>
      <span className={cx('bb-display', styles.title)}>{title}</span>
    </Frame>
  )
}
