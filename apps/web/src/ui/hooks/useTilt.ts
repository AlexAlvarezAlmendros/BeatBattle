import { spring } from '@beatbattle/shared/tokens'
import { useSpring } from 'motion/react'
import { type PointerEvent, type RefObject, useEffect, useRef } from 'react'
import { COARSE_POINTER_QUERY, useMediaQuery } from './useMediaQuery'
import { useReducedMotion } from './useReducedMotion'

/** Inclinación máxima en grados (§3.3: «máx. 6°»). */
export const TILT_MAX_DEG = 6

/** Perspectiva de la inclinación, la del sello (`perspective(800px)` en el propio transform). */
export const TILT_PERSPECTIVE_PX = 800

/** Variables CSS con la posición del brillo especular, en % del ancho y del alto de la pieza. */
export const GLARE_X_VAR = '--tilt-glare-x'
export const GLARE_Y_VAR = '--tilt-glare-y'

export interface TiltOptions {
  /** Grados máximos en cada eje. */
  maxDeg?: number
  /** Apaga la inclinación aunque el equipo pueda (p. ej. tarjetas de listas largas). */
  disabled?: boolean
}

export interface Tilt<T extends HTMLElement> {
  /** Ref para el elemento que se inclina. */
  ref: RefObject<T | null>
  /**
   * ¿Se inclina? `false` con «reducir movimiento», con puntero táctil o con `disabled`: la pieza
   * pone entonces su variante sin movimiento (Anexo E: «borde que se ilumina»).
   */
  enabled: boolean
  /** Manejadores para el elemento (vacíos si no se inclina). */
  handlers: {
    onPointerMove?: (event: PointerEvent<T>) => void
    onPointerLeave?: (event: PointerEvent<T>) => void
  }
}

/**
 * Inclinación 3D al pasar el ratón con brillo especular que sigue al cursor: `useTilt` del sello
 * (`ReactOtpWeb/frontend/src/hooks/useTilt.js`, el TiltedCard de ReactBits) portado a TypeScript.
 *
 * Diferencias con el del sello: máximo 6° (§3.3) en lugar de 10°, sin escalado, muelle de
 * interacción de los tokens (§3.6) y el brillo como variables CSS (`--tilt-glare-x/y`) que pinta la
 * pieza. Escribe el `transform` directamente en el elemento (sin re-render de React por cada
 * movimiento del ratón).
 *
 * Se desactiva con «reducir movimiento» (RNF-A11Y-03: sin 3D) y con puntero táctil.
 */
export function useTilt<T extends HTMLElement>({
  maxDeg = TILT_MAX_DEG,
  disabled = false,
}: TiltOptions = {}): Tilt<T> {
  const reduced = useReducedMotion()
  const coarse = useMediaQuery(COARSE_POINTER_QUERY)
  const enabled = !disabled && !reduced && !coarse

  const ref = useRef<T>(null)
  const rotateX = useSpring(0, spring.interaction)
  const rotateY = useSpring(0, spring.interaction)

  useEffect(() => {
    const element = ref.current
    if (!element || !enabled) return
    const write = () => {
      element.style.transform = tiltTransform(rotateX.get(), rotateY.get())
    }
    const unsubscribe = [rotateX.on('change', write), rotateY.on('change', write)]
    return () => {
      for (const stop of unsubscribe) stop()
      rotateX.jump(0)
      rotateY.jump(0)
      element.style.removeProperty('transform')
      element.style.removeProperty(GLARE_X_VAR)
      element.style.removeProperty(GLARE_Y_VAR)
    }
  }, [enabled, rotateX, rotateY])

  if (!enabled) return { ref, enabled, handlers: {} }

  return {
    ref,
    enabled,
    handlers: {
      onPointerMove: (event) => {
        if (event.pointerType === 'touch') return
        const rect = event.currentTarget.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) return
        const x = clamp01((event.clientX - rect.left) / rect.width)
        const y = clamp01((event.clientY - rect.top) / rect.height)
        const { rotateX: rx, rotateY: ry } = tiltAngles(x, y, maxDeg)
        rotateX.set(rx)
        rotateY.set(ry)
        event.currentTarget.style.setProperty(GLARE_X_VAR, `${(x * 100).toFixed(1)}%`)
        event.currentTarget.style.setProperty(GLARE_Y_VAR, `${(y * 100).toFixed(1)}%`)
      },
      onPointerLeave: () => {
        rotateX.set(0)
        rotateY.set(0)
      },
    },
  }
}

/**
 * Ángulos para un punto de la pieza (`x`, `y` en 0–1 desde la esquina superior izquierda): el borde
 * bajo el cursor se hunde. En el centro, 0°; en los bordes, ±`maxDeg`.
 */
export function tiltAngles(
  x: number,
  y: number,
  maxDeg = TILT_MAX_DEG,
): { rotateX: number; rotateY: number } {
  return {
    rotateX: round2((0.5 - clamp01(y)) * 2 * maxDeg),
    rotateY: round2((clamp01(x) - 0.5) * 2 * maxDeg),
  }
}

/** `transform` de una inclinación, con la perspectiva dentro (no hace falta un padre con `perspective`). */
export function tiltTransform(rotateX: number, rotateY: number): string {
  return `perspective(${TILT_PERSPECTIVE_PX}px) rotateX(${round2(rotateX)}deg) rotateY(${round2(rotateY)}deg)`
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const round2 = (value: number) => Math.round(value * 100) / 100 || 0
