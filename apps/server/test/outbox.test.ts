import { eq } from 'drizzle-orm'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { runBatch } from '../src/db/batch'
import type { Db } from '../src/db/client'
import { emailOutbox, emailPref, emailStat, emailSuppression } from '../src/db/schema'
import { createTestDb } from '../src/db/testDb'
import type { EmailKind } from '../src/email/catalog'
import { createMemoryMailer, type MemoryMailer } from '../src/email/mailer'
import { type DrainDeps, type EmailTarget, emailDrain, emailHash, enqueueEmail } from '../src/email/outbox'
import {
  type DueEmail,
  planBudget,
  QUOTA_WINDOW_MS,
  RETRY_DELAYS_MS,
  SERVICE_RESERVE,
} from '../src/email/policy'

const T0 = Date.UTC(2026, 9, 12, 10, 0, 0)
const SENDER = { name: 'Beat Battle · Other People', address: 'batalla@otherpeople.es' }

async function addUser(db: Db, id: string, email = `${id}@example.com`): Promise<void> {
  await db.$client.execute({
    sql: 'INSERT INTO user (id, name, email, username, updated_at) VALUES (?, ?, ?, ?, 0)',
    args: [id, id, email, id],
  })
}

interface Harness {
  db: Db
  mailer: MemoryMailer
  clock: { t: number }
  deps: DrainDeps
  enqueue(kind: EmailKind, target: EmailTarget, key?: string): Promise<string>
}

let seq = 0
async function harness(limit = 100): Promise<Harness> {
  const db = await createTestDb()
  const mailer = createMemoryMailer(SENDER)
  const clock = { t: T0 }
  const deps: DrainDeps = {
    db,
    mailer,
    now: () => clock.t,
    dailyLimit: limit,
    render: async (row) => ({ subject: `[${row.kind}]`, html: '<p>x</p>', text: 'x' }),
    unsubscribeUrl: (to, kind) =>
      `https://battle.otherpeople.es/api/unsubscribe/one-click?token=${kind}:${to}`,
  }
  return {
    db,
    mailer,
    clock,
    deps,
    async enqueue(kind, target, key) {
      seq += 1
      const id = `00000000-0000-7000-8000-${String(seq).padStart(12, '0')}`
      await runBatch(db, [
        enqueueEmail(db, {
          id,
          kind,
          target,
          idempotencyKey: key ?? `${kind}:${id}`,
          payload: {},
          now: clock.t,
        }),
      ])
      return id
    },
  }
}

const status = async (db: Db, id: string) =>
  (await db.select().from(emailOutbox).where(eq(emailOutbox.id, id)))[0]

describe('presupuesto diario (§4.19.1)', () => {
  it('RF-NOTIF-17: límite 10 y 15 en cola (3 de servicio) → salen los 3 de servicio y 7 por prioridad; 5 se aplazan', () => {
    const due: DueEmail[] = [
      ...Array.from({ length: 12 }, (_, i) => ({
        id: `b${i}`,
        family: 'battle' as const,
        priority: 10 + i,
        createdAt: i,
      })),
      ...Array.from({ length: 3 }, (_, i) => ({
        id: `s${i}`,
        family: 'service' as const,
        priority: 0,
        createdAt: 100 + i,
      })),
    ]
    const plan = planBudget({ limit: 10, sentInWindow: 0, serviceSentInWindow: 0, due, maxThisRun: 40 })
    expect(plan.send.filter((id) => id.startsWith('s'))).toEqual(['s0', 's1', 's2'])
    expect(plan.send.filter((id) => id.startsWith('b'))).toEqual(['b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6'])
    expect(plan.defer).toEqual(['b7', 'b8', 'b9', 'b10', 'b11'])
  })

  it('RF-NOTIF-17: sin servicio en cola, el resto no se come la reserva', () => {
    const due = Array.from({ length: 12 }, (_, i) => ({
      id: `b${i}`,
      family: 'battle' as const,
      priority: 10,
      createdAt: i,
    }))
    const plan = planBudget({ limit: 10, sentInWindow: 0, serviceSentInWindow: 0, due, maxThisRun: 40 })
    expect(plan.send).toHaveLength(7)
    expect(plan.defer).toHaveLength(5)
  })

  it('RF-NOTIF-17 (propiedades): nunca pasa del cupo, el servicio no se aplaza mientras quede hueco y lo demás respeta la reserva y la prioridad', () => {
    const dueArb = fc.uniqueArray(
      fc.record({
        id: fc.uuid(),
        family: fc.constantFrom('service', 'battle', 'marketing'),
        priority: fc.integer({ min: 0, max: 99 }),
        createdAt: fc.integer({ min: 0, max: 1000 }),
      }),
      { selector: (e) => e.id, maxLength: 60 },
    )
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 0, max: 60 }),
        fc.integer({ min: 0, max: 60 }),
        dueArb,
        fc.integer({ min: 1, max: 40 }),
        (limit, sentRaw, serviceRaw, due, maxThisRun) => {
          const sentInWindow = Math.min(sentRaw, limit)
          const serviceSentInWindow = Math.min(serviceRaw, sentInWindow)
          const plan = planBudget({ limit, sentInWindow, serviceSentInWindow, due, maxThisRun })
          const byId = new Map(due.map((e) => [e.id, e]))
          const remaining = limit - sentInWindow
          expect(plan.send.length).toBeLessThanOrEqual(Math.min(remaining, maxThisRun))
          expect(new Set([...plan.send, ...plan.defer]).size).toBe(plan.send.length + plan.defer.length)
          const sentService = plan.send.filter((id) => byId.get(id)?.family === 'service').length
          const sentOther = plan.send.length - sentService
          const reserve = Math.ceil(limit * SERVICE_RESERVE)
          // Lo no de servicio nunca invade la parte de la reserva que el servicio no ha usado.
          expect(sentOther).toBeLessThanOrEqual(
            Math.max(0, remaining - sentService - Math.max(0, reserve - serviceSentInWindow - sentService)),
          )
          // Un email de servicio solo se aplaza si ya no queda cupo.
          const deferredService = plan.defer.filter((id) => byId.get(id)?.family === 'service').length
          if (deferredService > 0) expect(sentService).toBe(remaining)
          // Entre los no de servicio, nada aplazado va antes que algo enviado.
          const sentOthers = plan.send.map((id) => byId.get(id)).filter((e) => e && e.family !== 'service')
          const deferredOthers = plan.defer
            .map((id) => byId.get(id))
            .filter((e) => e && e.family !== 'service')
          for (const s of sentOthers)
            for (const d of deferredOthers) expect((s?.priority ?? 0) <= (d?.priority ?? 0)).toBe(true)
        },
      ),
    )
  })

  it('RF-NOTIF-17: con la BD, sin cupo los avisos siguen en cola con not_before cuando se libere la ventana', async () => {
    const h = await harness(4)
    for (const id of ['a', 'b', 'c', 'd', 'e']) await addUser(h.db, id)
    const ids = []
    for (const id of ['a', 'b', 'c', 'd', 'e']) ids.push(await h.enqueue('battle.reminder', { userId: id }))
    const result = await emailDrain(h.deps)
    // Límite 4, reserva 1 de servicio sin usar → salen 3 avisos y 2 se aplazan 24 h.
    expect(result).toMatchObject({ sent: 3, deferred: 2 })
    const deferred = await status(h.db, ids[4] as string)
    expect(deferred).toMatchObject({ status: 'queued', notBefore: T0 + QUOTA_WINDOW_MS })
  })
})

describe('cola de salida (§4.19.3)', () => {
  it('RF-NOTIF-02: reencolar con la misma clave no duplica', async () => {
    const h = await harness()
    await addUser(h.db, 'aina')
    await h.enqueue('battle.monday', { userId: 'aina' }, 'battle.monday:aina:2026-w41')
    await h.enqueue('battle.monday', { userId: 'aina' }, 'battle.monday:aina:2026-w41')
    expect(await h.db.select().from(emailOutbox)).toHaveLength(1)
    await emailDrain(h.deps)
    await emailDrain(h.deps)
    expect(h.mailer.sent).toHaveLength(1)
  })

  it('RF-NOTIF-04: el servicio sale con todos los avisos desactivados y aunque la dirección esté suprimida', async () => {
    const h = await harness()
    await addUser(h.db, 'aina')
    await h.db.insert(emailPref).values({
      userId: 'aina',
      dropOn: false,
      resultsOn: false,
      reminderOn: false,
      juryCallOn: false,
      firstVotesOn: false,
      labelPickOn: false,
      progressOn: false,
      seasonOn: false,
      marketingOn: false,
      updatedAt: T0,
    })
    await h.db
      .insert(emailSuppression)
      .values({ emailHash: emailHash('aina@example.com'), reason: 'unsubscribed_all', createdAt: T0 })
    const id = await h.enqueue('entry.receipt', { userId: 'aina' })
    const reminder = await h.enqueue('battle.reminder', { userId: 'aina' })
    await emailDrain(h.deps)
    expect(await status(h.db, id)).toMatchObject({ status: 'sent' })
    expect(await status(h.db, reminder)).toMatchObject({ status: 'suppressed' })
    expect(h.mailer.sent.map((e) => e.subject)).toEqual(['[entry.receipt]'])
    expect(h.mailer.sent[0]?.unsubscribeUrl).toBeUndefined()
  })

  it('RF-NOTIF-01: marketing solo con consentimiento; los avisos, según su interruptor; todo lo no de servicio lleva baja', async () => {
    const h = await harness()
    await addUser(h.db, 'sin')
    await addUser(h.db, 'con')
    await h.db.insert(emailPref).values([
      { userId: 'sin', marketingOn: false, reminderOn: false, updatedAt: T0 },
      { userId: 'con', marketingOn: true, updatedAt: T0 },
    ])
    const mktSin = await h.enqueue('mkt.campaign', { userId: 'sin' })
    const mktCon = await h.enqueue('mkt.campaign', { userId: 'con' })
    const reminderSin = await h.enqueue('battle.reminder', { userId: 'sin' })
    const reminderCon = await h.enqueue('battle.reminder', { userId: 'con' })
    await emailDrain(h.deps)
    expect(await status(h.db, mktSin)).toMatchObject({ status: 'skipped', skipReason: 'no_consent' })
    expect(await status(h.db, mktCon)).toMatchObject({ status: 'sent' })
    expect(await status(h.db, reminderSin)).toMatchObject({ status: 'skipped', skipReason: 'pref_off' })
    expect(await status(h.db, reminderCon)).toMatchObject({ status: 'sent' })
    for (const email of h.mailer.sent) expect(email.unsubscribeUrl).toMatch(/one-click\?token=/)
  })

  it('el lunes combinado sale si está activo el drop o los resultados', async () => {
    const h = await harness()
    await addUser(h.db, 'aina')
    await h.db.insert(emailPref).values({ userId: 'aina', dropOn: false, resultsOn: true, updatedAt: T0 })
    const id = await h.enqueue('battle.monday', { userId: 'aina' })
    await emailDrain(h.deps)
    expect(await status(h.db, id)).toMatchObject({ status: 'sent' })
  })

  it('reintentos a 1 min, 5 min, 30 min y 2 h; después, failed (y cada fallo se avisa sin la dirección)', async () => {
    const h = await harness()
    const errors: unknown[] = []
    h.deps.onSendError = (info) => errors.push(info)
    await addUser(h.db, 'aina')
    const id = await h.enqueue('auth.verify', { userId: 'aina' })
    h.mailer.failNext(10)
    await emailDrain(h.deps)
    expect(await status(h.db, id)).toMatchObject({
      status: 'queued',
      attempts: 1,
      notBefore: T0 + (RETRY_DELAYS_MS[0] as number),
    })
    for (const delay of RETRY_DELAYS_MS) {
      h.clock.t += delay
      await emailDrain(h.deps)
    }
    expect(await status(h.db, id)).toMatchObject({ status: 'failed', attempts: 5 })
    expect(errors).toHaveLength(5)
    expect(errors.at(-1)).toMatchObject({ kind: 'auth.verify', attempts: 5, final: true })
    expect(JSON.stringify(errors)).not.toContain('@example.com')
  })

  it('dos drenajes a la vez no envían dos veces el mismo email', async () => {
    const h = await harness()
    for (const id of ['a', 'b', 'c']) await addUser(h.db, id)
    for (const id of ['a', 'b', 'c']) await h.enqueue('auth.welcome', { userId: id })
    await Promise.all([emailDrain(h.deps), emailDrain(h.deps), emailDrain(h.deps)])
    expect(h.mailer.sent).toHaveLength(3)
  })

  it('sin transporte, los emails se quedan en cola', async () => {
    const h = await harness()
    await addUser(h.db, 'aina')
    const id = await h.enqueue('auth.verify', { userId: 'aina' })
    await emailDrain({ ...h.deps, mailer: null })
    expect(await status(h.db, id)).toMatchObject({ status: 'queued', attempts: 0 })
  })

  it('una cuenta borrada no recibe nada; a una dirección suelta (account.deleted) sí se envía', async () => {
    const h = await harness()
    const ghost = await h.enqueue('battle.reminder', { userId: 'no-existe' })
    const deleted = await h.enqueue('account.deleted', { address: 'adios@example.com' })
    await emailDrain(h.deps)
    expect(await status(h.db, ghost)).toMatchObject({ status: 'skipped', skipReason: 'no_recipient' })
    expect(await status(h.db, deleted)).toMatchObject({ status: 'sent' })
  })

  it('las estadísticas son solo agregadas: por tipo y día, sin destinatarios', async () => {
    const h = await harness()
    for (const id of ['a', 'b']) await addUser(h.db, id)
    for (const id of ['a', 'b']) await h.enqueue('auth.welcome', { userId: id })
    await emailDrain(h.deps)
    const stats = await h.db.select().from(emailStat)
    expect(stats).toEqual([{ scope: 'kind:auth.welcome', day: '2026-10-12', metric: 'sent', count: 2 }])
  })
})
