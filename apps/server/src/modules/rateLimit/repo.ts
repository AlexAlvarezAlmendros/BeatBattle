import { lte, sql } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { appRateLimit } from '../../db/schema'

export interface Counter {
  count: number
  resetAt: number
}

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
