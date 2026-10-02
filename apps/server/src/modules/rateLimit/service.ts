import type { Db } from '../../db/client'
import { rateLimited } from '../../lib/errors'
import { rateLimitRepo } from './repo'

/**
 * Rate limit genérico con contadores en la BD (guía §4.13; base de `RNF-SEC-02`). Ventana fija por
 * clave: el primer intento abre la ventana de `windowMs`, los siguientes suman, y al pasar `resetAt`
 * vuelve a empezar. Cada fase define sus reglas (votos 120/h, firmas de subida 10/h…) y su test.
 *
 * Claves: `<regla>:<ámbito>:<id>`, p. ej. `vote:user:<userId>` o `play:ip:<ipHash>:<entryId>`.
 * Nunca una IP en claro (RGPD, §4.14): siempre el hash con sal rotatoria.
 */
export interface RateLimitInput {
  key: string
  /** Intentos permitidos por ventana (entero ≥ 1). */
  limit: number
  windowMs: number
  /** Instante de la petición (`request.now`). */
  now: number
}

export interface RateLimitResult {
  allowed: boolean
  /** Intentos que quedan en la ventana actual (0 si ya no se permite ninguno). */
  remaining: number
  /** Fin de la ventana actual en ms Unix. */
  resetAt: number
}

function assertInput({ key, limit, windowMs, now }: RateLimitInput): void {
  if (key.length === 0) throw new TypeError('rateLimit: la clave no puede estar vacía')
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new RangeError('rateLimit: limit debe ser un entero ≥ 1')
  if (!Number.isSafeInteger(windowMs) || windowMs < 1)
    throw new RangeError('rateLimit: windowMs debe ser un entero ≥ 1')
  if (!Number.isSafeInteger(now) || now < 0) throw new RangeError('rateLimit: now debe ser un instante en ms')
}

/** Cuenta un intento y dice si cabe en el límite. Los intentos rechazados también cuentan. */
export async function rateLimit(db: Db, input: RateLimitInput): Promise<RateLimitResult> {
  assertInput(input)
  const { count, resetAt } = await rateLimitRepo.hit(db, input.key, input.now, input.windowMs)
  return {
    allowed: count <= input.limit,
    remaining: Math.max(0, input.limit - count),
    resetAt,
  }
}

/**
 * Igual que `rateLimit`, pero lanza 429 `RATE_LIMITED` con `Retry-After` (segundos hasta el fin de
 * la ventana) si se supera. Es lo que usan las rutas: `await enforceRateLimit(db, { … })`.
 */
export async function enforceRateLimit(db: Db, input: RateLimitInput): Promise<RateLimitResult> {
  const result = await rateLimit(db, input)
  if (!result.allowed) throw rateLimited(result.resetAt - input.now)
  return result
}

/** Borra los contadores caducados; devuelve cuántos. */
export function purgeExpiredRateLimits(db: Db, now: number): Promise<number> {
  return rateLimitRepo.purgeExpired(db, now)
}
