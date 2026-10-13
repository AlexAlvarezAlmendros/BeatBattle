import {
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useId,
  useRef,
} from 'react'
import { Link, type To } from 'react-router'
import { audio } from '../../audio/engine'
import { t } from '../../i18n'
import { announce, ensureAnnouncer } from '../announce'
import { Cursor } from '../Cursor'
import { frameAttributes } from '../Frame'
import { cx, forceStateAttr, type InteractionState } from '../forceState'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { Icon, type IconName } from '../Icon'
import { Key } from '../Key'
import styles from './Button.module.css'
import { WaveLoader } from './WaveLoader'

/**
 * Variantes del botón (§3.3): `cta` (relleno `--bb-red-cta`, texto blanco: 4,75:1), `brand` (relleno
 * `--bb-red`, texto negro: 5,32:1), `white` (relleno blanco, texto negro) y `outline` (borde blanco,
 * fondo negro).
 */
export type ButtonVariant = 'cta' | 'brand' | 'white' | 'outline'
/** Alturas: `sm` 40 px (objetivo de 44 por pseudoelemento), `md` 48 y `lg` 56. */
export type ButtonSize = 'sm' | 'md' | 'lg'
/** Resultado de la última acción: `success` (check y texto) o `error` (aviso de papel y sacudida). */
export type ButtonStatus = 'idle' | 'success' | 'error'

export const BUTTON_VARIANTS: readonly ButtonVariant[] = ['cta', 'brand', 'white', 'outline']
export const BUTTON_SIZES: readonly ButtonSize[] = ['sm', 'md', 'lg']

/**
 * Escala al pulsar (§3.3, Anexo E: *squish* a 0,97). La aplica el CSS (`[data-pressed]`, transición de
 * `--bb-dur-instant` con `--bb-ease-snap`); aquí queda como dato para los tests y la galería.
 */
export const PRESSED_SCALE = 0.97

interface BaseProps {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Icono delante del texto (o solo el icono, con `iconOnly`). */
  icon?: IconName
  /** Botón cuadrado solo con icono: necesita `aria-label`. */
  iconOnly?: boolean
  /** Tecla que lo acciona, a la derecha («INTRO», «J»): la ayuda visible del teclado. */
  keyHint?: string
  /** Estado de interacción forzado para la galería (`data-force-state`). */
  state?: InteractionState
  /** Sustituye el contenido por la onda de 5 barras, con `aria-busy` y texto accesible. */
  loading?: boolean
  /** Texto accesible mientras carga (por defecto, «Cargando…»). */
  loadingLabel?: string
  status?: ButtonStatus
  /**
   * Deshabilitado: panel neutro con texto de deshabilitado y `aria-disabled` (sigue siendo enfocable para que se lea el
   * motivo). Los clics no hacen nada.
   */
  disabled?: boolean
  /** Por qué está deshabilitado, en texto al lado del botón y en su `aria-describedby`. */
  disabledReason?: string
  /** Ocupa todo el ancho de su contenedor. */
  fullWidth?: boolean
  className?: string
  children?: ReactNode
  'aria-label'?: string
  ref?: Ref<HTMLButtonElement | HTMLAnchorElement>
}

type Omitted = keyof BaseProps | 'disabled'

interface AsButton extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, Omitted> {
  to?: never
  href?: never
}

interface AsRouterLink extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, Omitted | 'href'> {
  /** Ruta interna: se pinta un `<Link>` de React Router. */
  to: To
  replace?: boolean
  href?: never
}

interface AsAnchor extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, Omitted> {
  /** Enlace externo o de descarga: se pinta un `<a>`. */
  href: string
  to?: never
}

export type ButtonProps = BaseProps & (AsButton | AsRouterLink | AsAnchor)

type AnyHandlers = {
  onClick?: (event: MouseEvent<HTMLElement>) => void
  onPointerDown?: (event: PointerEvent<HTMLElement>) => void
  onPointerEnter?: (event: PointerEvent<HTMLElement>) => void
  onPointerUp?: (event: PointerEvent<HTMLElement>) => void
  onPointerLeave?: (event: PointerEvent<HTMLElement>) => void
  onPointerCancel?: (event: PointerEvent<HTMLElement>) => void
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void
  onKeyUp?: (event: KeyboardEvent<HTMLElement>) => void
}

/**
 * Botón de la arena (guía §3.3): rectángulo con chaflán `--bb-cut-md`, display cursiva 800 a 15 px y
 * 118 %, mayúsculas, con su tecla a la derecha (`[INTRO]`). Pinta un `<Link>` con `to`, un `<a>` con
 * `href` y un `<button type="button">` en el resto de casos.
 *
 * - **Hover**: avanza 4 px. **Foco**: el cursor de juego (marco blanco de 3 px a 4 px que sigue el
 *   chaflán). **Pulsado**: escala 0,97 (ratón, toque, Espacio o Intro) con una transición CSS de
 *   `--bb-dur-instant` y `--bb-ease-snap` (el rebote de la curva hace de muelle). Sin Motion: el botón
 *   está en la primera pintura y Motion pesaba ≈ 20 kB gz solo por esto (RNF-PERF-02). Con «reducir
 *   movimiento», ni avance ni escala (Anexo E).
 * - **Cargando**: la onda de 5 barras sustituye al texto sin cambiar el ancho; `aria-busy` y el foco
 *   se queda en el botón, pero los clics no hacen nada.
 * - **Deshabilitado**: panel neutro, `aria-disabled` y el motivo en texto al lado (`disabledReason`).
 * - **Éxito**: check y texto. **Error**: aviso de papel (blanco con texto negro, 21:1), icono de alerta y
 *   una sacudida corta. Los dos se nombran («Subido (Hecho)») y se anuncian al pasar a ellos (WCAG 4.1.3).
 * - El sonido (`ui.press`) lo cablea la Fase 1.
 */
export function Button(props: ButtonProps) {
  const {
    variant = 'cta',
    size = 'md',
    icon,
    iconOnly = false,
    keyHint,
    state,
    loading = false,
    loadingLabel,
    status = 'idle',
    disabled = false,
    disabledReason,
    fullWidth = false,
    className,
    children,
    ref,
    to,
    href,
    replace,
    ...rest
  } = props as BaseProps &
    AnyHandlers & {
      to?: To
      href?: string
      replace?: boolean
      type?: 'button' | 'submit' | 'reset'
    } & Record<string, unknown>
  const handlers = rest as AnyHandlers
  const reduced = useReducedMotion()
  const reasonId = useId()
  const elementRef = useRef<HTMLElement | null>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const inert = loading || disabled
  const ariaLabel = rest['aria-label'] as string | undefined
  const statusText = status === 'idle' ? undefined : t(`ui.button.${status}`)

  // Un botón con `status` puede anunciar: la región viva tiene que existir antes del mensaje.
  const announces = props.status !== undefined
  useEffect(() => {
    if (announces) ensureAnnouncer()
  }, [announces])

  // Al pasar a éxito o error (no al montar ya en ese estado, como en la galería), se anuncia.
  const lastStatus = useRef(status)
  useEffect(() => {
    if (status === lastStatus.current) return
    lastStatus.current = status
    if (!statusText) return
    const label = ariaLabel ?? textRef.current?.textContent?.trim()
    announce(label ? t('ui.button.withState', { label, state: statusText }) : statusText)
  }, [status, statusText, ariaLabel])

  const setRef = useCallback(
    (node: HTMLButtonElement | HTMLAnchorElement | null) => {
      elementRef.current = node
      if (typeof ref === 'function') ref(node)
      else if (ref) ref.current = node
    },
    [ref],
  )

  /*
   * Pulsado: `data-pressed` en el elemento (sin re-render) y el CSS escala con su transición. Soltar solo
   * hace algo si estaba pulsado: pasar el ratón por encima y salir no toca nada.
   */
  const squish = (down: boolean) => {
    const element = elementRef.current
    if (!element) return
    if (down) {
      if (!reduced && !inert) element.setAttribute('data-pressed', '')
    } else if (element.hasAttribute('data-pressed')) {
      element.removeAttribute('data-pressed')
    }
  }

  const eventProps = {
    // Sonidos de la interfaz (Anexo E): `ui.hover` al pasar el ratón (el motor lo limita a 8 por segundo)
    // y `ui.press` al pulsar; nada si el botón está deshabilitado o cargando.
    onPointerEnter: (event: PointerEvent<HTMLElement>) => {
      handlers.onPointerEnter?.(event)
      if (!inert && event.pointerType === 'mouse') audio.play('ui.hover')
    },
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      handlers.onPointerDown?.(event)
      if (event.button === 0) squish(true)
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      handlers.onPointerUp?.(event)
      squish(false)
    },
    onPointerLeave: (event: PointerEvent<HTMLElement>) => {
      handlers.onPointerLeave?.(event)
      squish(false)
    },
    onPointerCancel: (event: PointerEvent<HTMLElement>) => {
      handlers.onPointerCancel?.(event)
      squish(false)
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      handlers.onKeyDown?.(event)
      if (!event.repeat && (event.key === ' ' || event.key === 'Enter')) squish(true)
    },
    onKeyUp: (event: KeyboardEvent<HTMLElement>) => {
      handlers.onKeyUp?.(event)
      if (event.key === ' ' || event.key === 'Enter') squish(false)
    },
    onClick: (event: MouseEvent<HTMLElement>) => {
      if (inert) {
        event.preventDefault()
        return
      }
      audio.play('ui.press')
      handlers.onClick?.(event)
    },
  }

  const glyph: IconName | undefined = status === 'success' ? 'check' : status === 'error' ? 'alert' : icon
  const content = (
    <>
      <Cursor cut="md" />
      <span className={styles.content} aria-hidden={loading || undefined}>
        {glyph && <Icon name={glyph} className={styles.glyph} />}
        {!iconOnly && (
          <span ref={textRef} className={styles.text}>
            {children}
          </span>
        )}
        {/* El estado también con palabras (nunca solo el icono): «Subido (Hecho)». */}
        {!iconOnly && statusText && (
          <>
            {' '}
            <span className="sr-only">{t('ui.button.stateHint', { state: statusText })}</span>
          </>
        )}
        {keyHint && !iconOnly && (
          <Key
            tone={variant === 'white' || variant === 'brand' || status === 'error' ? 'light' : 'dark'}
            aria-hidden="true"
          >
            {keyHint}
          </Key>
        )}
      </span>
      {loading && (
        <>
          <WaveLoader />
          <span className="sr-only">{loadingLabel ?? t('ui.button.loading')}</span>
        </>
      )}
    </>
  )

  // El botón solo con icono se nombra con su `aria-label`, que tapa el contenido: el estado va dentro.
  const iconState = loading ? (loadingLabel ?? t('ui.button.loading')) : statusText
  const shared = {
    ...rest,
    ...(iconOnly && ariaLabel && iconState
      ? { 'aria-label': t('ui.button.withState', { label: ariaLabel, state: iconState }) }
      : {}),
    ...eventProps,
    ...frameAttributes({ cut: 'md' }),
    'data-cursor': '',
    className: cx(
      styles.button,
      styles[variant],
      styles[size],
      iconOnly && styles.iconOnly,
      fullWidth && styles.full,
      className,
    ),
    'data-variant': variant,
    'data-status': status === 'idle' ? undefined : status,
    'aria-busy': loading || undefined,
    'aria-disabled': inert || undefined,
    'aria-describedby': disabled && disabledReason ? reasonId : undefined,
    ...forceStateAttr(state),
  }

  let control: ReactNode
  if (to !== undefined) {
    control = (
      <Link {...shared} ref={setRef} to={to} replace={replace}>
        {content}
      </Link>
    )
  } else if (href !== undefined) {
    control = (
      <a {...shared} ref={setRef} href={disabled ? undefined : href}>
        {content}
      </a>
    )
  } else {
    const type = (rest.type as 'button' | 'submit' | 'reset' | undefined) ?? 'button'
    control = (
      <button {...shared} ref={setRef} type={type}>
        {content}
      </button>
    )
  }

  if (!disabled || !disabledReason) return control
  return (
    <span className={cx(styles.withReason, fullWidth && styles.full)}>
      {control}
      <span id={reasonId} className={styles.reason}>
        {disabledReason}
      </span>
    </span>
  )
}
