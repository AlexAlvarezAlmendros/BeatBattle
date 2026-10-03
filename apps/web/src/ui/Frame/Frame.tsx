import type { ComponentPropsWithRef, ElementType } from 'react'
import './frame.css'

/** Variantes del marco (§3.3): panel opaco, escenario (borde rojo con trama) y título (borde blanco). */
export type FrameVariant = 'panel' | 'stage' | 'title'

/**
 * Chaflanes de §3.2: `xs` 5 px (teclas), `sm` 7 (chips), `md` 10 (botones, teselas, avatar), `base`
 * 14 (marcos, casillas, reloj) y `lg` 22 (paneles grandes, modales, portadas).
 */
export type FrameCut = 'xs' | 'sm' | 'md' | 'base' | 'lg'

export const FRAME_VARIANTS: readonly FrameVariant[] = ['panel', 'stage', 'title']
export const FRAME_CUTS: readonly FrameCut[] = ['xs', 'sm', 'md', 'base', 'lg']

export interface FrameOptions {
  /** Por defecto, `panel`. */
  variant?: FrameVariant
  /** Por defecto, `base` (`--bb-cut`, 14 px). */
  cut?: FrameCut
  /** Solo `stage`: la trama de puntos del relleno (por defecto, sí). */
  texture?: boolean
}

/**
 * Atributos que convierten cualquier elemento en un marco (`ui/Frame/frame.css`): para piezas que no
 * pueden envolverse en `<Frame>` (un `<Link>` del router, un `<li>` de una lista ARIA).
 *
 * ```tsx
 * <Link to="/jurado" {...frameAttributes({ cut: 'md' })} className={styles.plate}>…</Link>
 * ```
 */
export function frameAttributes({ variant = 'panel', cut = 'base', texture = true }: FrameOptions = {}) {
  return {
    'data-frame': variant,
    'data-frame-cut': cut,
    ...(variant === 'stage' && !texture ? { 'data-frame-texture': 'off' } : {}),
  }
}

export type FrameProps<E extends ElementType = 'div'> = FrameOptions & {
  /** Elemento que se pinta (por defecto, `div`). */
  as?: E
} & Omit<ComponentPropsWithRef<E>, keyof FrameOptions | 'as'>

/**
 * Marco de esquina recortada (`Frame`, guía §3.3): dos capas recortadas (borde de 2 px y relleno) para
 * que el borde siga el chaflán. Variantes `panel`, `stage` y `title`; chaflán por prop. Una pieza que
 * se monta encima ajusta `--frame-border`, `--frame-fill`, `--frame-cut` o `--frame-stroke` desde su
 * clase (las reglas del marco tienen especificidad 0).
 */
export function Frame<E extends ElementType = 'div'>({ as, variant, cut, texture, ...rest }: FrameProps<E>) {
  const Component: ElementType = as ?? 'div'
  return <Component {...rest} {...frameAttributes({ variant, cut, texture })} />
}
