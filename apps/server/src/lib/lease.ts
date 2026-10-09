import { and, eq, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { jobLease } from '../db/schema'

/**
 * *Lease* en BD (§4.12, `job_lease`): en serverless no hay memoria compartida, así que dos ejecuciones de
 * la misma tarea (el cron de Vercel y el de GitHub, o dos lecturas que sellan a la vez) se coordinan aquí.
 * Tomarla es un único `UPSERT` condicionado: solo gana quien la encuentra libre o caducada.
 */
export async function acquireLease(
  db: Db,
  input: { name: string; holder: string; ttlMs: number; now: number },
): Promise<boolean> {
  const expiresAt = input.now + input.ttlMs
  await db
    .insert(jobLease)
    .values({ name: input.name, holder: input.holder, expiresAt })
    .onConflictDoUpdate({
      target: jobLease.name,
      set: { holder: input.holder, expiresAt },
      setWhere: sql`${jobLease.expiresAt} <= ${input.now}`,
    })
  const [row] = await db
    .select({ holder: jobLease.holder })
    .from(jobLease)
    .where(eq(jobLease.name, input.name))
  return row?.holder === input.holder
}

/** Suelta la *lease* si sigue siendo de `holder`. */
export async function releaseLease(db: Db, name: string, holder: string): Promise<void> {
  await db.delete(jobLease).where(and(eq(jobLease.name, name), eq(jobLease.holder, holder)))
}

/** Ejecuta `fn` con la *lease* tomada; si otro la tiene, devuelve `null` sin ejecutar nada. */
export async function withLease<T>(
  db: Db,
  input: { name: string; holder: string; ttlMs: number; now: number },
  fn: () => Promise<T>,
): Promise<T | null> {
  if (!(await acquireLease(db, input))) return null
  try {
    return await fn()
  } finally {
    await releaseLease(db, input.name, input.holder)
  }
}
