import { type HTMLAttributes, type ReactNode, type Ref, useRef } from 'react'
import { Link, type To } from 'react-router'
import { t } from '../../i18n'
import { Cursor } from '../Cursor'
import { cx, forceStateAttr, type InteractionState } from '../forceState'
import { useFitText } from '../hooks/useFitText'
import { Icon } from '../Icon'
import { Key } from '../Key'
import styles from './MenuPlate.module.css'

/** Cuerpo mínimo de la etiqueta al ajustarla a su hueco, en px (`RD-VIS-05`: nunca por debajo de 12). */
const LABEL_MIN_FONT_PX = 16

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
  /**
   * Dato corto a la derecha, que se ve siempre: una cifra con su unidad («16 sin votar», «1 min»), una
   * etiqueta («NUEVO») o el motivo si está deshabilitada (que puede ocupar dos líneas: nunca se corta).
   */
  detail?: ReactNode
  /**
   * Dato largo, en texto («Subir mi beat», «Semana 40», «Sonido · movimiento»): en las placas estrechas
   * (móvil) solo lo enseña la elegida, como en la maqueta `01-menu-390x844`.
   */
  extra?: ReactNode
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
 * la selección): sale 26 px a la izquierda, crece a 84 px, se rellena de `--bb-red-cta`, texto blanco a
 * 31 px, marco blanco, flecha y etiqueta 1P, y enseña su `[INTRO]`. **Pulsada**: escala 0,98.
 * **Deshabilitada**: candado, etiqueta en `--bb-text-4` y el motivo. En móvil, 48 px (56 la elegida).
 * Va dentro de un `role="menu"` como `menuitem` (lo ponen las `itemProps`).
 *
 * El dato y la tecla nunca se encogen: lo que cede es la etiqueta, que baja su anchura de 125 a 105 % y
 * después el cuerpo (`useFitText`), como el alias de la ficha de luchador. La trama de relleno va en una
 * franja al final de la placa, fuera de todo texto (`RD-VIS-05`).
 */
export function MenuPlate({
  index,
  label,
  detail,
  extra,
  keyHint,
  disabled = false,
  to,
  itemProps,
  state,
  className,
}: MenuPlateProps) {
  const { ref, ...item } = itemProps
  // La elegida crece (25 → 31 px): la etiqueta se vuelve a ajustar a su hueco desde ese cuerpo.
  const chosen = item['data-cursor-active'] === 'true' || state === 'focus' || state === 'pressed'
  const labelRef = useRef<HTMLSpanElement>(null)
  useFitText(labelRef, label, {
    fromStretch: '--bb-stretch-plate',
    minFontPx: LABEL_MIN_FONT_PX,
    state: chosen,
  })
  const body = (
    <>
      <Cursor shape="slant" player />
      <span className={styles.texture} aria-hidden="true" />
      <span className={styles.arrow} aria-hidden="true" />
      <span className={styles.index} aria-hidden="true">
        {t('ui.menuPlate.index', { index: String(index).padStart(2, '0') })}
      </span>
      <span ref={labelRef} className={styles.label} data-plate-label="">
        {disabled && <Icon name="lock" className={styles.lock} />}
        {label}
      </span>
      <span className={styles.detail}>
        {detail !== undefined && (
          <span className={styles.detailText} data-plate-detail="">
            {detail}
          </span>
        )}
        {extra !== undefined && <span className={styles.extra}>{extra}</span>}
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
    'data-menu-plate': '',
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
