import type { HTMLAttributes, ReactNode, Ref } from 'react'
import { Link, type To } from 'react-router'
import { t } from '../../i18n'
import { Cursor } from '../Cursor'
import { cx, forceStateAttr, type InteractionState } from '../forceState'
import { Icon } from '../Icon'
import { Key } from '../Key'
import styles from './MenuPlate.module.css'

/**
 * Props que pone el menú (`useRovingMenu().getItemProps(i)`): rol, `tabIndex`, `data-cursor*`,
 * `aria-disabled`, `ref` y manejadores.
 */
export type MenuPlateItemProps = HTMLAttributes<HTMLElement> & {
  ref?: Ref<HTMLElement> | ((element: HTMLElement | null) => void)
  'data-cursor'?: ''
  'data-cursor-active'?: 'true'
  'aria-disabled'?: boolean | 'true' | 'false'
}

export interface MenuPlateProps {
  /** Número de la opción (1 → «01»): índice en Oxanium rojo, decorativo. */
  index: number
  /** Etiqueta en display («JUGAR»). */
  label: string
  /** Dato a la derecha («16 sin votar», «NUEVO · Semana 40», el motivo si está deshabilitada). */
  detail?: ReactNode
  /** Tecla de entrar que enseña la elegida (por defecto, «INTRO»). */
  keyHint?: string
  /** Deshabilitada: candado, etiqueta apagada y el motivo en `detail` (§3.3). */
  disabled?: boolean
  /** A dónde lleva (ruta interna). Sin `to`, es un botón del menú (`onClick` de `itemProps`). */
  to?: To
  /** Las props del menú de foco itinerante. */
  itemProps: MenuPlateItemProps
  /** Estado forzado para la galería. */
  state?: InteractionState
  className?: string
}

/**
 * Opción de menú (guía §3.3 «Opción de menú», §3.8.3): placa en paralelogramo de 70 px con el índice en
 * Oxanium rojo, la etiqueta en display a 25 px y un dato a la derecha. **Elegida/enfocada** (el foco es
 * la selección): sale 26 px a la izquierda, crece a 84 px, se rellena de `--bb-red-cta` con trama, texto
 * blanco a 31 px, marco blanco, flecha y etiqueta 1P, y enseña su `[INTRO]`. **Pulsada**: escala 0,98.
 * **Deshabilitada**: candado, etiqueta en `--bb-text-4` y el motivo. En móvil, 48 px (56 la elegida).
 * Va dentro de un `role="menu"` como `menuitem` (lo ponen las `itemProps`).
 */
export function MenuPlate({
  index,
  label,
  detail,
  keyHint,
  disabled = false,
  to,
  itemProps,
  state,
  className,
}: MenuPlateProps) {
  const { ref, ...item } = itemProps
  const body = (
    <>
      <Cursor shape="slant" player />
      <span className={styles.texture} aria-hidden="true" />
      <span className={styles.arrow} aria-hidden="true" />
      <span className={styles.index} aria-hidden="true">
        {t('ui.menuPlate.index', { index: String(index).padStart(2, '0') })}
      </span>
      <span className={styles.label}>
        {disabled && <Icon name="lock" className={styles.lock} />}
        {label}
      </span>
      <span className={styles.detail}>
        {detail !== undefined && <span className={styles.detailText}>{detail}</span>}
        {!disabled && (
          <Key tone="light" className={styles.key} aria-hidden="true">
            {keyHint ?? t('frame.keys.glyph.enter')}
          </Key>
        )}
      </span>
    </>
  )
  const shared = {
    ...item,
    className: cx(styles.plate, className),
    'data-disabled': disabled || undefined,
    ...forceStateAttr(state),
  }
  if (to !== undefined) {
    return (
      <Link {...shared} ref={ref as Ref<HTMLAnchorElement>} to={to}>
        {body}
      </Link>
    )
  }
  return (
    <div {...shared} ref={ref as Ref<HTMLDivElement>}>
      {body}
    </div>
  )
}
