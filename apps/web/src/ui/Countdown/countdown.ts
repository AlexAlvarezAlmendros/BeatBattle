/** Cálculos de la cuenta atrás, sin React: partes, fase y hitos que se anuncian. */

export const SECOND_MS = 1000
export const MINUTE_MS = 60 * SECOND_MS
export const HOUR_MS = 60 * MINUTE_MS
export const DAY_MS = 24 * HOUR_MS

export interface CountdownParts {
  days: number
  hours: number
  minutes: number
  seconds: number
}

/**
 * Días, horas, minutos y segundos que faltan. Redondea los segundos hacia arriba: mientras quede
 * algo, no se enseña «00:00:00:00».
 */
export function countdownParts(remainingMs: number): CountdownParts {
  const total = Math.max(0, Math.ceil(remainingMs / SECOND_MS))
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  }
}

/**
 * Fase visual (§3.3): `normal`; `urgent` en las últimas 24 h (rojo); `final` en la última hora
 * (rojo y latido); `ended` al llegar a cero.
 */
export type CountdownPhase = 'normal' | 'urgent' | 'final' | 'ended'

export function countdownPhase(remainingMs: number): CountdownPhase {
  if (remainingMs <= 0) return 'ended'
  if (remainingMs <= HOUR_MS) return 'final'
  if (remainingMs <= DAY_MS) return 'urgent'
  return 'normal'
}

/** Hitos que se anuncian a los lectores de pantalla (RNF-A11Y-07: 24 h, 1 h y 10 min) y el final. */
export type CountdownMilestone = 'day' | 'hour' | 'tenMinutes' | 'ended'

const MILESTONES: readonly { id: CountdownMilestone; atMs: number }[] = [
  { id: 'ended', atMs: 0 },
  { id: 'tenMinutes', atMs: 10 * MINUTE_MS },
  { id: 'hour', atMs: HOUR_MS },
  { id: 'day', atMs: DAY_MS },
]

/**
 * Hito cruzado al pasar de `beforeMs` a `afterMs` restantes (el más cercano al final si se cruzan
 * varios a la vez, p. ej. al volver de una pestaña dormida). `null` si no se cruza ninguno.
 */
export function crossedMilestone(beforeMs: number, afterMs: number): CountdownMilestone | null {
  for (const { id, atMs } of MILESTONES) {
    if (beforeMs > atMs && afterMs <= atMs) return id
  }
  return null
}

/** Número con al menos dos cifras: `7` → `"07"`. */
export const pad2 = (value: number) => String(value).padStart(2, '0')
