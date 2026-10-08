import type { EmailFamily } from '../db/schema'
import type { KindInfo } from './catalog'

/**
 * Política de la cola de salida (guía §4.19.1 y §4.19.3, tarea 2.8), en funciones puras: el `emailDrain`
 * solo lee la BD, llama aquí y escribe lo que sale. Sin reloj ni azar: el instante entra como argumento.
 */

/** Ventana del cupo diario: móvil, de 24 h, como la de la cuenta de Google (`RF-NOTIF-17`). */
export const QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000

/** Parte del cupo reservada para los emails de servicio. */
export const SERVICE_RESERVE = 0.25

/** Esperas entre reintentos (1 min, 5 min, 30 min, 2 h); después, `failed` y alerta en el panel. */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000] as const

/** Como mucho, emails por llamada a `emailDrain` (en Vercel, por `tick`). */
export const DRAIN_MAX_PER_RUN = 40

export interface DueEmail {
  id: string
  family: EmailFamily
  priority: number
  createdAt: number
}

export interface BudgetInput {
  limit: number
  /** Enviados en la ventana de 24 h (todos y, de ellos, de servicio). */
  sentInWindow: number
  serviceSentInWindow: number
  /** Los que tocan ya, en cualquier orden. */
  due: readonly DueEmail[]
  /** Tope de esta ejecución (además del cupo). */
  maxThisRun: number
}

export interface BudgetPlan {
  /** Ids que salen ahora, por prioridad. */
  send: string[]
  /** Ids sin cupo: siguen en cola con `not_before` aplazado. */
  defer: string[]
}

/** Orden de salida: prioridad, después antigüedad (y el id, para que sea total). */
export function byPriority(a: DueEmail, b: DueEmail): number {
  return a.priority - b.priority || a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

/**
 * Reparte el cupo (`RF-NOTIF-17`): el servicio puede usar todo lo que queda; el resto, lo que queda menos la
 * parte de la reserva de servicio que aún no se ha gastado. Lo que no cabe se aplaza. El tope por ejecución
 * no aplaza nada: lo que no sale ahora sale en la siguiente.
 */
export function planBudget(input: BudgetInput): BudgetPlan {
  const reserve = Math.ceil(input.limit * SERVICE_RESERVE)
  let remaining = Math.max(0, input.limit - input.sentInWindow)
  let serviceSent = input.serviceSentInWindow
  let runLeft = input.maxThisRun
  const send: string[] = []
  const defer: string[] = []
  const ordered = [...input.due].sort(byPriority)
  const service = ordered.filter((email) => email.family === 'service')
  const rest = ordered.filter((email) => email.family !== 'service')
  for (const email of service) {
    if (runLeft === 0) break
    if (remaining === 0) {
      defer.push(email.id)
      continue
    }
    send.push(email.id)
    remaining -= 1
    serviceSent += 1
    runLeft -= 1
  }
  const unusedReserve = Math.max(0, reserve - serviceSent)
  let allowance = Math.max(0, remaining - unusedReserve)
  for (const email of rest) {
    if (runLeft === 0) break
    if (allowance === 0) {
      defer.push(email.id)
      continue
    }
    send.push(email.id)
    allowance -= 1
    runLeft -= 1
  }
  return { send, defer }
}

/**
 * Cuándo vuelve a haber hueco: cuando el envío más antiguo de la ventana sale de ella. Sin envíos en la
 * ventana (el cupo se ha gastado en esta misma ejecución), dentro de 24 h.
 */
export function nextSlotAt(now: number, oldestSentInWindow: number | null): number {
  return (oldestSentInWindow ?? now) + QUOTA_WINDOW_MS
}

/** Tras un fallo de envío: cuándo reintentar, o `null` si se han agotado los reintentos (→ `failed`). */
export function retryAt(now: number, attemptsSoFar: number): number | null {
  const delay = RETRY_DELAYS_MS[attemptsSoFar - 1]
  return delay === undefined ? null : now + delay
}

export interface Recipient {
  email: string
  /** `email_pref` de la cuenta (sin fila, los valores por defecto); `null` si no hay cuenta. */
  prefs: Readonly<Record<string, boolean | string>> | null
  /** Último consentimiento de marketing registrado (cuenta o suscriptor). */
  marketingConsent: boolean
  suppressed: boolean
  /** Suscriptor sin cuenta: ¿confirmado y sin baja? (`true` si es una cuenta). */
  subscriberActive: boolean
}

export type Decision =
  | { action: 'send' }
  | { action: 'skip'; reason: 'pref_off' | 'no_consent' | 'unsubscribed' }
  | { action: 'suppress' }

/**
 * Qué hacer con un email **al enviarlo** (no al encolarlo, §4.19.3): el servicio sale siempre
 * (`RF-NOTIF-04`); lo demás respeta la supresión, la suscripción, los interruptores por tipo y, en
 * marketing, el consentimiento (`RF-NOTIF-01`). Las horas de silencio y el tope semanal (`RF-NOTIF-08`)
 * llegan con los avisos que los necesitan (Fase 5).
 */
export function decide(info: KindInfo, recipient: Recipient): Decision {
  if (info.family === 'service') return { action: 'send' }
  if (recipient.suppressed) return { action: 'suppress' }
  if (!recipient.subscriberActive) return { action: 'skip', reason: 'unsubscribed' }
  if (info.family === 'marketing')
    return recipient.marketingConsent ? { action: 'send' } : { action: 'skip', reason: 'no_consent' }
  // Avisos: sin cuenta (suscriptor de la alerta), los que admite su suscripción (el drop); con cuenta, sus
  // interruptores (basta uno de los del tipo).
  if (recipient.prefs === null) return { action: 'send' }
  const prefs = recipient.prefs
  return info.prefs.some((key) => prefs[key] !== false)
    ? { action: 'send' }
    : { action: 'skip', reason: 'pref_off' }
}
