import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { auditLog, user } from '../src/db/schema'
import { grantAdmin } from '../src/modules/admin/grant'
import { createAccount, makeApp, T0, type TestApp } from './helpers'

let t: TestApp | undefined
afterEach(async () => {
  await t?.app.close()
  t = undefined
})

describe('admin:grant, el primer admin desde la consola (§2.14)', () => {
  it('RF-ADM-05: da el rol admin a la cuenta (sin distinguir mayúsculas) y lo deja en audit_log, sin el email', async () => {
    t = await makeApp()
    const { id } = await createAccount(t, { email: 'jefa@example.com', username: 'jefa' })
    const result = await grantAdmin(t.db, { email: ' Jefa@Example.com ', now: T0, auditId: 'a1' })
    expect(result).toEqual({ status: 'granted', userId: id })
    const [account] = await t.db.select({ role: user.role }).from(user).where(eq(user.id, id))
    expect(account?.role).toBe('admin')
    const [entry] = await t.db.select().from(auditLog).where(eq(auditLog.id, 'a1'))
    expect(entry).toMatchObject({ actorId: id, action: 'user.grant_admin', target: id, createdAt: T0 })
    expect(JSON.stringify(entry)).not.toContain('jefa@example.com')
  })

  it('RF-ADM-05: si ya es admin no escribe nada; si la cuenta no existe, lo dice', async () => {
    t = await makeApp()
    const { id } = await createAccount(t, { email: 'jefa@example.com', username: 'jefa' })
    await grantAdmin(t.db, { email: 'jefa@example.com', now: T0, auditId: 'a1' })
    expect(await grantAdmin(t.db, { email: 'jefa@example.com', now: T0, auditId: 'a2' })).toEqual({
      status: 'already',
      userId: id,
    })
    expect(await grantAdmin(t.db, { email: 'nadie@example.com', now: T0, auditId: 'a3' })).toEqual({
      status: 'not-found',
    })
    expect(await t.db.select().from(auditLog)).toHaveLength(1)
  })
})
