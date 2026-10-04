import type { ReactNode } from 'react'
import { cx } from '../forceState'
import styles from './Icon.module.css'

/**
 * Iconos de trazo (24×24, trazo de 2 px y puntas redondas) dibujados aquí mismo, sin librería: los
 * pocos que necesitan los componentes base. Pintan con `currentColor`, así que toman el color del
 * texto de su pieza (rojo en las teselas, blanco en los botones…).
 */
/**
 * Play y pausa con la misma estructura de trazado (dos cuadriláteros: el triángulo partido en dos
 * mitades y las dos barras), para que el navegador interpole `d` y el play se transforme en pausa
 * (Anexo E, «morfología de trazado»). Sin movimiento, el cambio es directo.
 */
export const PLAY_PATH = 'M8 5.5L13.25 8.75L13.25 15.25L8 18.5ZM13.25 8.75L18.5 12L18.5 12L13.25 15.25Z'
export const PAUSE_PATH = 'M7 5L10.5 5L10.5 19L7 19ZM13.5 5L17 5L17 19L13.5 19Z'

const PATHS = {
  play: <path d={PLAY_PATH} className={cx(styles.solid, styles.morph)} />,
  pause: <path d={PAUSE_PATH} className={cx(styles.solid, styles.morph)} />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.5v.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.5v.01" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  tag: (
    <>
      <path d="M3 12V4h8l10 10-8 8z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </>
  ),
  /* Botón de sonido del HUD (§3.4.1): altavoz con ondas, o tachado. */
  soundOn: (
    <>
      <path d="M4 9h4l5-4v14l-5-4H4z" className={styles.solid} />
      <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
    </>
  ),
  soundOff: (
    <>
      <path d="M4 9h4l5-4v14l-5-4H4z" className={styles.solid} />
      <path d="M16 9l5 6M21 9l-5 6" />
    </>
  ),
  /* Opción de menú deshabilitada (§3.3 «Opción de menú»): candado. */
  lock: (
    <>
      <path d="M5 11h14v10H5z" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  /* Flecha maciza del cursor de las placas del menú y del botón «Escuchar». */
  triangleRight: <path d="M7 4.5v15L19 12z" className={styles.solid} />,
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof PATHS

export const ICON_NAMES = Object.keys(PATHS) as IconName[]

export interface IconProps {
  name: IconName
  /**
   * Texto para lectores de pantalla si el icono transmite algo por sí solo. Sin él, el icono es
   * decorativo (`aria-hidden`) y el significado lo da el texto de al lado o el `aria-label` del botón.
   */
  label?: string
  className?: string
}

export function Icon({ name, label, className }: IconProps) {
  if (!label) {
    return (
      <svg
        viewBox="0 0 24 24"
        className={cx(styles.icon, className)}
        data-icon={name}
        focusable="false"
        aria-hidden="true"
      >
        {PATHS[name]}
      </svg>
    )
  }
  return (
    <svg
      viewBox="0 0 24 24"
      className={cx(styles.icon, className)}
      data-icon={name}
      focusable="false"
      role="img"
      aria-label={label}
    >
      {PATHS[name]}
    </svg>
  )
}
