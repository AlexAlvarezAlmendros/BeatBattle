import { lte, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { appRateLimit } from '../db/schema'
import { rateLimited } from './errors'

/**
 * Rate limit genérico con contadores en la BD (guía §4.4 y §4.13; base de `RNF-SEC-02`). Va en `lib/`
 * y no como módulo porque no es un recurso con rutas: lo usan las rutas de los demás módulos. Ventana
 * fija por clave: el primer intento abre la ventana de `windowMs`, los siguientes suman, y al pasar
 * `resetAt` vuelve a empezar. Cada fase define sus reglas (votos 120/h, firmas de subida 10/h…) y su
 * test.
 *
 * Claves: `<regla>:<ámbito>:<id>`, p. ej. `vote:user:<userId>` o `play:ip:<ipHash>:<entryId>`.
 * Nunca una IP en claro (RGPD, §4.14): siempre el hash con sal rotatoria.
 *
 * Mismo patrón que los servicios de los módulos (ver `app.ts`): `createRateLimiter({ db })` guarda sus
 * dependencias y el repo son funciones que reciben la BD.
 */

export interface Counter {
  count: number
  resetAt: number
}

/** Acceso a datos del rate limit: solo SQL. */
export const rateLimitRepo = {
  /**
   * Cuenta un intento con un único `INSERT … ON CONFLICT … DO UPDATE … RETURNING`: atómico aunque
   * lleguen peticiones a la vez desde varias instancias. Si la ventana de la clave ya caducó
   * (`reset_at <= now`), la reinicia con `count = 1`; si no, suma uno y conserva su fin.
   */
  async hit(db: Db, key: string, now: number, windowMs: number): Promise<Counter> {
    const rows = await db
      .insert(appRateLimit)
      .values({ key, count: 1, resetAt: now + windowMs })
      .onConflictDoUpdate({
        target: appRateLimit.key,
        set: {
          count: sql`CASE WHEN ${appRateLimit.resetAt} <= ${now} THEN 1 ELSE ${appRateLimit.count} + 1 END`,
          resetAt: sql`CASE WHEN ${appRateLimit.resetAt} <= ${now} THEN ${now + windowMs} ELSE ${appRateLimit.resetAt} END`,
        },
      })
      .returning({ count: appRateLimit.count, resetAt: appRateLimit.resetAt })
    const row = rows[0]
    if (!row) throw new Error('rateLimit: el UPSERT no devolvió fila')
    return row
  },

  /** Borra los contadores caducados (lo llamará la tarea `cleanup` del tick, Fase 3). */
  async purgeExpired(db: Db, now: number): Promise<number> {
    const rows = await db
      .delete(appRateLimit)
      .where(lte(appRateLimit.resetAt, now))
      .returning({ key: appRateLimit.key })
    return rows.length
  },
}

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

export interface RateLimiterDeps {
  db: Db
}

export interface RateLimiter {
  /** Cuenta un intento y dice si cabe en el límite. Los intentos rechazados también cuentan. */
  check(input: RateLimitInput): Promise<RateLimitResult>
  /**
   * Igual que `check`, pero lanza 429 `RATE_LIMITED` con `Retry-After` (segundos hasta el fin de la
   * ventana) si se supera. Es lo que usan las rutas: `await rateLimiter.enforce({ … })`.
   */
  enforce(input: RateLimitInput): Promise<RateLimitResult>
  /** Borra los contadores caducados; devuelve cuántos (lo llamará la tarea `cleanup` del tick). */
  purgeExpired(now: number): Promise<number>
}

function assertInput({ key, limit, windowMs, now }: RateLimitInput): void {
  if (key.length === 0) throw new TypeError('rateLimit: la clave no puede estar vacía')
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new RangeError('rateLimit: limit debe ser un entero ≥ 1')
  if (!Number.isSafeInteger(windowMs) || windowMs < 1)
    throw new RangeError('rateLimit: windowMs debe ser un entero ≥ 1')
  if (!Number.isSafeInteger(now) || now < 0) throw new RangeError('rateLimit: now debe ser un instante en ms')
}

export function createRateLimiter({ db }: RateLimiterDeps): RateLimiter {
  const check = async (input: RateLimitInput): Promise<RateLimitResult> => {
    assertInput(input)
    const { count, resetAt } = await rateLimitRepo.hit(db, input.key, input.now, input.windowMs)
    return { allowed: count <= input.limit, remaining: Math.max(0, input.limit - count), resetAt }
  }
  return {
    check,
    async enforce(input) {
      const result = await check(input)
      if (!result.allowed) throw rateLimited(result.resetAt - input.now)
      return result
    },
    purgeExpired: (now) => rateLimitRepo.purgeExpired(db, now),
  }
}
