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
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  music: (
    <>
      <path d="M9 18V5l11-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
    </>
  ),
  metronome: <path d="M7 21L10.5 3h3L17 21zM12 15l5-8M7 21h10" />,
  sharp: <path d="M10 4L8 20M16 4l-2 16M5 9h15M4 15h15" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
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
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </>
  ),
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
