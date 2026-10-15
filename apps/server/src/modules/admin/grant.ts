import { eq, sql } from 'drizzle-orm'
import { runBatch } from '../../db/batch'
import type { Db } from '../../db/client'
import { user } from '../../db/schema'
import { auditStatement } from '../../lib/audit'

export type GrantAdminResult =
  | { status: 'granted'; userId: string }
  | { status: 'already'; userId: string }
  | { status: 'not-found' }

/**
 * Da el rol `admin` a una cuenta que ya existe (guía §2.14, `RF-ADM-05`): el primer admin de un entorno no
 * puede dárselo nadie desde el panel, así que sale de la consola (`pnpm admin:grant`). El cambio y su
 * registro en `audit_log` van en el mismo `batch`; el actor es la propia cuenta (no hay otro) y la razón
 * dice que vino de la consola. El registro no guarda el email, solo el id.
 */
export async function grantAdmin(
  db: Db,
  input: { email: string; now: number; auditId: string },
): Promise<GrantAdminResult> {
  const [account] = await db
    .select({ id: user.id, role: user.role })
    .from(user)
    .where(eq(sql`lower(${user.email})`, input.email.trim().toLowerCase()))
    .limit(1)
  if (!account) return { status: 'not-found' }
  if (account.role === 'admin') return { status: 'already', userId: account.id }
  await runBatch(db, [
    db
      .update(user)
      .set({ role: 'admin', updatedAt: new Date(input.now) })
      .where(eq(user.id, account.id)),
    auditStatement(db, {
      id: input.auditId,
      actorId: account.id,
      action: 'user.grant_admin',
      target: account.id,
      reason: 'consola (pnpm admin:grant)',
      payload: { role: { from: account.role ?? 'user', to: 'admin' } },
      now: input.now,
    }),
  ])
  return { status: 'granted', userId: account.id }
}
