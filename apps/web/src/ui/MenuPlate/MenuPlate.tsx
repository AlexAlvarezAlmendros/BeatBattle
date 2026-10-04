import {
  type HTMLAttributes,
  type ReactNode,
  type Ref,
  type RefObject,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { Link, type To } from 'react-router'
import { t } from '../../i18n'
import { Cursor } from '../Cursor'
import { cx, forceStateAttr, type InteractionState } from '../forceState'
import { useFitText } from '../hooks/useFitText'
import { Icon } from '../Icon'
import { Key } from '../Key'
import styles from './MenuPlate.module.css'
import { MENU_LABEL_MIN_PX } from './useMenuPlateFit'

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
  /**
   * La clave del ajuste común del menú (`useMenuPlateFit`): cuando cambia el cuerpo común de las placas, la
   * etiqueta vuelve a ajustar su anchura desde él.
   */
  fitKey?: string
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
 * después el cuerpo (`useFitText`), como el alias de la ficha de luchador. Si ni así cabe al lado del dato,
 * el dato baja a una segunda línea (`useStackWhenCramped`): la etiqueta nunca se corta. La trama de relleno
 * va en una franja al final de la placa, fuera de todo texto (`RD-VIS-05`).
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
  fitKey,
  className,
}: MenuPlateProps) {
  const { ref, ...item } = itemProps
  // La elegida crece (25 → 31 px): la etiqueta se vuelve a ajustar a su hueco desde ese cuerpo.
  const chosen = item['data-cursor-active'] === 'true' || state === 'focus' || state === 'pressed'
  const labelRef = useRef<HTMLSpanElement>(null)
  const detailRef = useRef<HTMLSpanElement>(null)
  // Antes que ajustar la etiqueta: decide si el dato va al lado o debajo, y el ajuste parte de ahí.
  const stacked = useStackWhenCramped(labelRef, detailRef, `${label}|${disabled}|${chosen}`)
  useFitText(labelRef, label, {
    fromStretch: '--bb-stretch-plate',
    minFontPx: MENU_LABEL_MIN_PX,
    state: `${chosen}|${fitKey ?? ''}|${stacked}`,
  })
  const body = (
    <>
      <Cursor shape="slant" player />
      <span className={styles.texture} aria-hidden="true" />
      <span className={styles.arrow} aria-hidden="true" data-plate-arrow="" />
      <span className={styles.index} aria-hidden="true">
        {t('ui.menuPlate.index', { index: String(index).padStart(2, '0') })}
      </span>
      <span ref={labelRef} className={styles.label} data-plate-label="">
        {disabled && <Icon name="lock" className={styles.lock} />}
        {label}
      </span>
      <span ref={detailRef} className={styles.detail}>
        {detail !== undefined && (
          <span className={styles.detailText} data-plate-detail="">
            {detail}
          </span>
        )}
        {extra !== undefined && (
          <span className={styles.extra} data-plate-extra="">
            {extra}
          </span>
        )}
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
    'data-plate-stack': stacked || undefined,
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

/** Atributo de la placa con el dato en una segunda línea (`MenuPlate.module.css`). */
const STACK_ATTR = 'data-plate-stack'

/**
 * La etiqueta nunca se corta (§3.3): si, con el dato o el motivo al lado, no cabe ni a su cuerpo mínimo
 * (`MENU_LABEL_MIN_PX`) con la anchura mínima del display (`--bb-stretch-min`), el dato baja a una segunda
 * línea, bajo la etiqueta. Se mide en la propia placa, con el dato al lado (quitando un momento el atributo y
 * el ajuste de `useFitText`, sin pintar nada en medio), cuando cambian su ancho, su etiqueta, su estado
 * (`state`: la elegida enseña su tecla), el texto del dato y la fuente web. Donde el dato ya va debajo (la
 * lista estrecha del menú, por debajo de 360 px) o no hay dato, no hace nada. Solo baja lo que no cabe: la
 * deshabilitada «RESULTADOS · Aún nada sellado» en una placa de 313 px (la galería; jurado de la 0.28, cierre:
 * la etiqueta quedaba en 12–21 px de ancho, recortada), no «JUGAR [INTRO]», que cabe al lado (revisión del
 * cierre: con un umbral de ancho, la tecla bajaba igual). Sin `ResizeObserver` (jsdom), nunca baja.
 */
function useStackWhenCramped(
  labelRef: RefObject<HTMLElement | null>,
  detailRef: RefObject<HTMLElement | null>,
  state: string,
): boolean {
  const [stacked, setStacked] = useState(false)
  useLayoutEffect(() => {
    void state
    const label = labelRef.current
    const plate = label?.parentElement
    const detail = detailRef.current
    if (!label || !plate || !detail || typeof ResizeObserver === 'undefined') return
    const check = () => {
      const was = plate.hasAttribute(STACK_ATTR)
      const { fontSize, fontStretch, whiteSpace } = label.style
      if (was) plate.removeAttribute(STACK_ATTR)
      const narrowest = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--bb-stretch-min'),
      )
      label.style.fontSize = `${MENU_LABEL_MIN_PX}px`
      label.style.fontStretch = Number.isFinite(narrowest) ? `${narrowest}%` : ''
      label.style.whiteSpace = ''
      // Solo si el dato va al lado (en la lista estrecha y por debajo de 360 px ya va debajo) y ocupa algo.
      const box = label.getBoundingClientRect()
      const aside = detail.getBoundingClientRect()
      const beside = aside.width > 0 && aside.top < box.bottom && box.top < aside.bottom
      const cramped = beside && label.scrollWidth > label.clientWidth + 0.5
      Object.assign(label.style, { fontSize, fontStretch, whiteSpace })
      if (was) plate.setAttribute(STACK_ATTR, '')
      setStacked(cramped)
    }
    check()
    let frame = 0
    const later = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(check)
    }
    // Solo el ancho: al bajar el dato, la placa cambia de alto, y eso no cambia lo medido.
    let width = plate.clientWidth
    const resize = new ResizeObserver(() => {
      if (plate.clientWidth === width) return
      width = plate.clientWidth
      later()
    })
    resize.observe(plate)
    const content = new MutationObserver(later)
    content.observe(detail, { childList: true, characterData: true, subtree: true })
    let active = true
    void document.fonts?.ready.then(() => {
      if (active) check()
    })
    return () => {
      active = false
      cancelAnimationFrame(frame)
      resize.disconnect()
      content.disconnect()
    }
  }, [labelRef, detailRef, state])
  return stacked
}
