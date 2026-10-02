import { spring } from '@beatbattle/shared/tokens'
import { animate } from 'motion/react'
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
  useRef,
} from 'react'
import { Link, type To } from 'react-router'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { t } from '../../i18n'
import { announce, ensureAnnouncer } from '../announce'
import { cx, forceStateAttr, type InteractionState } from '../forceState'
import { Icon, type IconName } from '../Icon'
import styles from './Button.module.css'
import { WaveLoader } from './WaveLoader'

export type ButtonVariant = 'cta' | 'outline' | 'icon'
export type ButtonSize = 'sm' | 'md' | 'lg'
/** Resultado de la última acción: `success` pinta destello y check; `error`, icono y sacudida. */
export type ButtonStatus = 'idle' | 'success' | 'error'

/** Escala al pulsar (§3.3, Anexo E: *squish* a 0,97 con el muelle de interacción). */
export const PRESSED_SCALE = 0.97

interface BaseProps {
  size?: ButtonSize
  /** Estado de interacción forzado para la galería (`data-force-state`). */
  state?: InteractionState
  /** Sustituye el contenido por la onda de 5 barras, con `aria-busy` y texto accesible. */
  loading?: boolean
  /** Texto accesible mientras carga (por defecto, «Cargando…»). */
  loadingLabel?: string
  status?: ButtonStatus
  disabled?: boolean
  /** Ocupa todo el ancho de su contenedor. */
  fullWidth?: boolean
  className?: string
  ref?: Ref<HTMLButtonElement | HTMLAnchorElement>
}

interface TextVariantProps {
  /** `cta` (rojo, por defecto) u `outline` (contorno). */
  variant?: 'cta' | 'outline'
  /** Icono delante del texto. */
  icon?: IconName
  children: ReactNode
  'aria-label'?: string
}

interface IconVariantProps {
  /** Botón redondo de 36–44 px solo con icono (como el play de la lista del sello). */
  variant: 'icon'
  icon: IconName
  /** Obligatorio: un botón sin texto necesita nombre accesible. */
  'aria-label': string
  children?: never
}

type Omitted = 'children' | 'aria-label' | 'className' | 'disabled' | 'ref'

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

export type ButtonProps = BaseProps &
  (TextVariantProps | IconVariantProps) &
  (AsButton | AsRouterLink | AsAnchor)

/** Todas las props a la vez, para el cuerpo del componente (los tipos de arriba garantizan las combinaciones). */
type AnyHandlers = {
  onClick?: (event: MouseEvent<HTMLElement>) => void
  onPointerDown?: (event: PointerEvent<HTMLElement>) => void
  onPointerUp?: (event: PointerEvent<HTMLElement>) => void
  onPointerLeave?: (event: PointerEvent<HTMLElement>) => void
  onPointerCancel?: (event: PointerEvent<HTMLElement>) => void
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void
  onKeyUp?: (event: KeyboardEvent<HTMLElement>) => void
}

const VARIANT_CLASS: Record<ButtonVariant, string | undefined> = {
  cta: styles.cta,
  outline: styles.outline,
  icon: styles.iconButton,
}

const SIZE_CLASS: Record<ButtonSize, string | undefined> = {
  sm: styles.sm,
  md: styles.md,
  lg: styles.lg,
}

/**
 * Botón base (§3.3): CTA rojo, contorno e icono redondo. Pinta un `<Link>` con `to`, un `<a>` con
 * `href` y un `<button type="button">` en el resto de casos.
 *
 * - Hover: sube 1 px y el halo crece (CTA). Pulsado: escala 0,97 con muelle (ratón, táctil, Espacio
 *   o Intro). Con «reducir movimiento» solo cambia el color (Anexo E).
 * - Cargando: la onda de 5 barras sustituye al contenido sin cambiar el ancho; `aria-busy` y el foco
 *   se queda en el botón (no se desactiva), pero los clics no hacen nada.
 * - Éxito: destello blanco y check. Error: icono y una sacudida corta. Los dos se nombran (texto
 *   oculto en el botón: «Subido (Hecho)») y, al pasar a ellos, se anuncian por la región viva
 *   compartida (WCAG 4.1.3). En el botón icono el `aria-label` se compone con el estado o la carga.
 * - El sonido (`ui.press`) lo cablea la Fase 1.
 */
export function Button(props: ButtonProps) {
  const {
    variant = 'cta',
    size = 'md',
    state,
    loading = false,
    loadingLabel,
    status = 'idle',
    disabled = false,
    fullWidth = false,
    className,
    icon,
    children,
    ref,
    to,
    href,
    replace,
    ...rest
  } = props as BaseProps &
    Partial<Omit<TextVariantProps, 'variant'>> & {
      variant?: ButtonVariant
      icon?: IconName
    } & AnyHandlers & {
      to?: To
      href?: string
      replace?: boolean
      type?: 'button' | 'submit' | 'reset'
      tabIndex?: number
    } & Record<string, unknown>
  const handlers = rest as AnyHandlers
  const reduced = useReducedMotion()
  const elementRef = useRef<HTMLElement | null>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const pressAnimation = useRef<ReturnType<typeof animate> | null>(null)
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

  const squish = (down: boolean) => {
    const element = elementRef.current
    if (!element || reduced || (down && inert)) return
    pressAnimation.current?.stop()
    pressAnimation.current = animate(
      element,
      { scale: down ? PRESSED_SCALE : 1 },
      { type: 'spring', ...spring.interaction },
    )
  }

  const eventProps = {
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
      handlers.onClick?.(event)
    },
  }

  const glyph: IconName | undefined = status === 'success' ? 'check' : status === 'error' ? 'alert' : icon
  const content = (
    <>
      <span className={styles.content} aria-hidden={loading || undefined}>
        {glyph && <Icon name={glyph} className={styles.glyph} />}
        {variant !== 'icon' && (
          <span ref={textRef} className={styles.text}>
            {children}
          </span>
        )}
        {/* El estado también con palabras (nunca solo el icono): «Subido (Hecho)». */}
        {variant !== 'icon' && statusText && (
          <>
            {' '}
            <span className="sr-only">{t('ui.button.stateHint', { state: statusText })}</span>
          </>
        )}
      </span>
      {loading && (
        <>
          <WaveLoader />
          <span className="sr-only">{loadingLabel ?? t('ui.button.loading')}</span>
        </>
      )}
      {status === 'success' && <span className={styles.flash} aria-hidden="true" />}
    </>
  )

  // El botón icono se nombra con su `aria-label`, que tapa el contenido: el estado va dentro.
  const iconState = loading ? (loadingLabel ?? t('ui.button.loading')) : statusText
  const shared = {
    ...rest,
    ...(variant === 'icon' && ariaLabel && iconState
      ? { 'aria-label': t('ui.button.withState', { label: ariaLabel, state: iconState }) }
      : {}),
    ...eventProps,
    className: cx(
      styles.button,
      VARIANT_CLASS[variant],
      SIZE_CLASS[size],
      fullWidth && styles.full,
      className,
    ),
    'data-variant': variant,
    'data-status': status === 'idle' ? undefined : status,
    'aria-busy': loading || undefined,
    ...forceStateAttr(state),
  }

  if (to !== undefined || href !== undefined) {
    // Un enlace no se puede desactivar: se anuncia como tal, sale del orden de tabulación y no navega.
    const linkProps = {
      ...shared,
      ref: setRef,
      'aria-disabled': inert || undefined,
      tabIndex: disabled ? -1 : (rest.tabIndex as number | undefined),
    }
    if (to !== undefined) {
      return (
        <Link {...linkProps} to={to} replace={replace}>
          {content}
        </Link>
      )
    }
    return (
      <a {...linkProps} href={disabled ? undefined : href}>
        {content}
      </a>
    )
  }

  return (
    <button
      {...shared}
      ref={setRef}
      type={(rest.type as 'button' | 'submit' | 'reset' | undefined) ?? 'button'}
      disabled={disabled}
      aria-disabled={loading || undefined}
    >
      {content}
    </button>
  )
}
