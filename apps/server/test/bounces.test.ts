import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { runBatch } from '../src/db/batch'
import { emailOutbox, emailStat, emailSuppression } from '../src/db/schema'
import { createTestDb } from '../src/db/testDb'
import { type BounceMailbox, bounceScan, parseBounce } from '../src/email/bounces'
import { createMemoryMailer } from '../src/email/mailer'
import { emailDrain, emailHash, enqueueEmail } from '../src/email/outbox'

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/bounces/${name}.eml`, import.meta.url), 'utf8')
const T0 = Date.UTC(2026, 9, 12, 10)

function fakeMailbox(messages: Record<number, string>): BounceMailbox & { archived: number[] } {
  const archived: number[] = []
  return {
    archived,
    async pending() {
      return Object.entries(messages)
        .filter(([uid]) => !archived.includes(Number(uid)))
        .map(([uid, raw]) => ({ uid: Number(uid), raw }))
    },
    async archive(uids) {
      archived.push(...uids)
    },
    async close() {},
  }
}

describe('rebotes (§4.19.2)', () => {
  it('lee el informe de entrega: destinatario (en minúsculas), si es permanente y su estado', () => {
    expect(parseBounce(fixture('permanente'))).toEqual({
      recipient: 'noexiste@example.com',
      permanent: true,
      status: '5.1.1',
    })
    expect(parseBounce(fixture('temporal'))).toEqual({
      recipient: 'lleno@example.com',
      permanent: false,
      status: '4.2.2',
    })
    expect(parseBounce(fixture('solo-cabecera'))).toEqual({
      recipient: 'otro@example.org',
      permanent: true,
      status: null,
    })
    expect(parseBounce(fixture('normal'))).toBeNull()
  })

  it('RF-NOTIF-10: un rebote permanente suprime la dirección; el siguiente envío a ella queda suppressed', async () => {
    const db = await createTestDb()
    const mailbox = fakeMailbox({ 1: fixture('permanente'), 2: fixture('temporal'), 3: fixture('normal') })
    const result = await bounceScan({ db, mailbox, now: T0 })
    expect(result).toEqual({ read: 3, suppressed: 1, temporary: 1, ignored: 1 })
    // Los avisos procesados salen de la bandeja (también el temporal y el que no era un rebote).
    expect(mailbox.archived).toEqual([1, 2, 3])
    expect(await db.select().from(emailSuppression)).toEqual([
      { emailHash: emailHash('noexiste@example.com'), reason: 'hard_bounce', createdAt: T0 },
    ])
    expect(await db.select().from(emailStat)).toEqual([
      { scope: 'all', day: '2026-10-12', metric: 'bounced', count: 1 },
    ])
    // El siguiente aviso a esa dirección no sale; a la del rebote temporal, sí.
    const mailer = createMemoryMailer({ name: 'BB', address: 'batalla@otherpeople.es' })
    await runBatch(db, [
      enqueueEmail(db, {
        id: 'a',
        kind: 'mkt.campaign',
        target: { address: 'noexiste@example.com' },
        idempotencyKey: 'a',
        payload: {},
        now: T0,
      }),
      enqueueEmail(db, {
        id: 'b',
        kind: 'mkt.campaign',
        target: { address: 'lleno@example.com' },
        idempotencyKey: 'b',
        payload: {},
        now: T0,
      }),
    ])
    await emailDrain({
      db,
      mailer,
      now: () => T0,
      dailyLimit: 100,
      render: async () => ({ subject: 's', html: 'h', text: 't' }),
      unsubscribeUrl: () => 'https://battle.otherpeople.es/api/unsubscribe/one-click?token=x',
    })
    const [a] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, 'a'))
    expect(a?.status).toBe('suppressed')
  })

  it('volver a pasar no duplica nada: lo procesado ya no está en la bandeja', async () => {
    const db = await createTestDb()
    const mailbox = fakeMailbox({ 1: fixture('permanente') })
    await bounceScan({ db, mailbox, now: T0 })
    expect(await bounceScan({ db, mailbox, now: T0 + 1 })).toEqual({
      read: 0,
      suppressed: 0,
      temporary: 0,
      ignored: 0,
    })
    expect(await db.select().from(emailSuppression)).toHaveLength(1)
  })
})
