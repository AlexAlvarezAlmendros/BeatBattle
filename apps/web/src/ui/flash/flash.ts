import { isSeriousMode } from '../hooks/useSeriousMode'

/**
 * Limitador de destellos (guía §3.6, `RD-MOT-04`, `RNF-A11Y-04`, WCAG 2.3.1): un servicio global que
 * autoriza como mucho **3 destellos por segundo** (en cualquier ventana de 1 s). Cada destello ocupa
 * como mucho el 25 % del área y el 40 % de opacidad, así que nunca es rojo saturado a pantalla
 * completa. Navegar no destella nunca: solo se piden destellos de recompensa (`FlashReason`).
 *
 * Toda pieza que destella (chispas del voto de 5, confeti, brillo de logro, partículas del Escenario)
 * pide permiso antes y pinta con lo que le devuelven:
 *
 * ```ts
 * const grant = flash.request({ reason: 'vote', area: 0.4, opacity: 0.8 })
 * if (grant) sparks.burst({ area: grant.area, opacity: grant.opacity })
 * ```
 *
 * En modo serio no se autoriza ninguno (se pierde espectáculo, nunca información).
 */

/** Límites de §3.6. */
export const FLASH_LIMITS = {
  /** Destellos como mucho en cualquier ventana de `windowMs`. */
  perWindow: 3,
  windowMs: 1000,
  /** Fracción máxima del área de la ventana. */
  maxArea: 0.25,
  /** Opacidad máxima. */
  maxOpacity: 0.4,
} as const

/** Motivos de un destello: solo recompensas (navegar no destella). */
export type FlashReason = 'vote' | 'combo' | 'xp' | 'achievement' | 'levelUp' | 'ceremony' | 'drop'

export interface FlashRequest {
  reason: FlashReason
  /** Fracción del área de la ventana que quiere ocupar (0–1); se recorta a `maxArea`. */
  area?: number
  /** Opacidad que quiere (0–1); se recorta a `maxOpacity`. */
  opacity?: number
}

/** Lo que se autoriza: área y opacidad ya recortadas. */
export interface FlashGrant {
  reason: FlashReason
  area: number
  opacity: number
}

export interface FlashLimiterOptions {
  /** Reloj en ms (por defecto, `performance.now`). */
  now?: () => number
  /** Si devuelve `true`, no se autoriza nada (por defecto, el modo serio). */
  suppressed?: () => boolean
}

export interface FlashLimiter {
  /** Pide un destello: lo autoriza (con área y opacidad recortadas) o devuelve `null`. */
  request(request: FlashRequest): FlashGrant | null
  /** Destellos autorizados en la ventana actual. */
  recent(): number
  /** Olvida el historial (tests y cambios de pantalla). */
  reset(): void
}

const clamp01 = (value: number) => (Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0)

export function createFlashLimiter({
  now = () => performance.now(),
  suppressed = isSeriousMode,
}: FlashLimiterOptions = {}): FlashLimiter {
  let granted: number[] = []
  const prune = (at: number) => {
    granted = granted.filter((time) => at - time < FLASH_LIMITS.windowMs)
  }
  return {
    request({ reason, area = FLASH_LIMITS.maxArea, opacity = FLASH_LIMITS.maxOpacity }) {
      if (suppressed()) return null
      const at = now()
      prune(at)
      if (granted.length >= FLASH_LIMITS.perWindow) return null
      granted.push(at)
      return {
        reason,
        area: Math.min(clamp01(area), FLASH_LIMITS.maxArea),
        opacity: Math.min(clamp01(opacity), FLASH_LIMITS.maxOpacity),
      }
    },
    recent() {
      prune(now())
      return granted.length
    },
    reset() {
      granted = []
    },
  }
}

/** El limitador de la app: uno solo para todas las piezas. */
export const flash: FlashLimiter = createFlashLimiter()
