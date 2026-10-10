import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { entry, sample, vote, week } from '../src/db/schema'
import { createAccount, makeApp, ORIGIN, T0, type TestApp } from './helpers'

/** Una semana mínima (con su sample) directamente en la BD; `sealed` la deja sellada. */
async function insertWeek(t: TestApp, number: number, { sealed = false } = {}): Promise<string> {
  const id = `week-${number}`
  await t.db.insert(sample).values({
    id: `sample-${number}`,
    title: 'Lluvia en Gràcia',
    credits: 'Other People Records',
    licenseText: 'Uso libre para la batalla.',
    durationMs: 6000,
    bytes: 1000,
    format: 'wav',
    audioPublicId: `beatbattle-test/samples/s${number}/original`,
    coverPublicId: `beatbattle-test/samples/s${number}/cover`,
    peaks: Buffer.alloc(2000),
    createdBy: 'admin',
    createdAt: T0,
  })
  await t.db.insert(week).values({
    id,
    number,
    slug: `2026-w${String(40 + number).padStart(2, '0')}`,
    seasonId: '2026-T4',
    sampleId: `sample-${number}`,
    rulesVersion: 1,
    startsAt: T0 + number * 1000,
    submitEndsAt: T0 + number * 1000 + 100,
    voteEndsAt: T0 + number * 1000 + 200,
    sealedAt: sealed ? T0 + number * 1000 + 300 : null,
    createdBy: 'admin',
    createdAt: T0,
  })
  return id
}

let serial = 0
function entryRow(weekId: string, userId: string, overrides: Partial<typeof entry.$inferInsert> = {}) {
  serial += 1
  return {
    id: `entry-${serial}`,
    weekId,
    userId,
    alias: `Alias ${serial}`,
    title: 'Mi flip',
    audioPublicId: `beatbattle-test/entries/${weekId}/${serial}`,
    etag: `etag-${serial}`,
    format: 'wav',
    bytes: 60_000_000,
    durationMs: 150_000,
    coverSeed: serial,
    receiptNumber: serial,
    status: 'active' as const,
    submittedAt: T0,
    updatedAt: T0,
    ...overrides,
  }
}

describe('tablas de las entradas (§4.11, tarea 4.3)', () => {
  it('RF-ENT-01: una sola entrada activa por cuenta y semana (índice parcial); retirada, libera el hueco', async () => {
    const t = await makeApp()
    const weekId = await insertWeek(t, 1)
    const first = entryRow(weekId, 'u1')
    await t.db.insert(entry).values(first)
    await expect(t.db.insert(entry).values(entryRow(weekId, 'u1'))).rejects.toThrow()
    await expect(
      t.db.insert(entry).values(entryRow(weekId, 'u1', { status: 'processing' })),
    ).rejects.toThrow()
    await t.db.update(entry).set({ status: 'withdrawn' }).where(eq(entry.id, first.id))
    await t.db.insert(entry).values(entryRow(weekId, 'u1'))
    // Otra cuenta, sin problema.
    await t.db.insert(entry).values(entryRow(weekId, 'u2'))
  })

  it('RF-VOTE-08: el alias y el número de recibo no se repiten en la semana (sí en otra)', async () => {
    const t = await makeApp()
    const w1 = await insertWeek(t, 1)
    const w2 = await insertWeek(t, 2)
    await t.db.insert(entry).values(entryRow(w1, 'u1', { alias: 'Tigre Púrpura', receiptNumber: 1 }))
    await expect(
      t.db.insert(entry).values(entryRow(w1, 'u2', { alias: 'Tigre Púrpura', receiptNumber: 2 })),
    ).rejects.toThrow()
    await expect(t.db.insert(entry).values(entryRow(w1, 'u2', { receiptNumber: 1 }))).rejects.toThrow()
    await t.db.insert(entry).values(entryRow(w2, 'u2', { alias: 'Tigre Púrpura', receiptNumber: 1 }))
  })

  it('un voto va de 1 a 5 estrellas y es uno por cuenta y entrada', async () => {
    const t = await makeApp()
    const base = { entryId: 'e1', weekId: 'w1', createdAt: T0, updatedAt: T0 }
    await expect(t.db.insert(vote).values({ ...base, userId: 'u1', stars: 0 })).rejects.toThrow()
    await expect(t.db.insert(vote).values({ ...base, userId: 'u1', stars: 6 })).rejects.toThrow()
    await t.db.insert(vote).values({ ...base, userId: 'u1', stars: 5 })
    await expect(t.db.insert(vote).values({ ...base, userId: 'u1', stars: 3 })).rejects.toThrow()
  })
})

describe('exportar y borrar la cuenta con entradas (RNF-PRIV-01)', () => {
  it('RF-PRF-05: la exportación lleva las entradas y los votos propios', async () => {
    const t = await makeApp()
    const { id, cookie } = await createAccount(t, { email: 'aina@example.com', username: 'aina' })
    const weekId = await insertWeek(t, 1)
    await t.db.insert(entry).values(entryRow(weekId, id, { title: 'Bruma', tags: '["Trap"]' }))
    await t.db
      .insert(vote)
      .values({ userId: id, entryId: 'otra', weekId, stars: 4, createdAt: T0, updatedAt: T0 })
    const res = await t.app.inject({ method: 'GET', url: '/api/me/export', headers: { cookie } })
    const game = res.json().data.game
    expect(game.entries).toHaveLength(1)
    expect(game.entries[0]).toMatchObject({ week: '2026-w41', title: 'Bruma', genres: ['Trap'] })
    expect(game.votes).toEqual([{ week: '2026-w41', entryId: 'otra', stars: 4, createdAt: T0 }])
  })

  it('RF-PRF-04: borra entradas y votos de semanas sin sellar; las selladas quedan como «Productor eliminado»', async () => {
    const t = await makeApp()
    const { id, cookie } = await createAccount(t, { email: 'aina@example.com', username: 'aina' })
    const open = await insertWeek(t, 1)
    const sealed = await insertWeek(t, 2, { sealed: true })
    const mine = entryRow(open, id)
    const mineSealed = entryRow(sealed, id)
    const theirs = entryRow(open, 'otro')
    await t.db.insert(entry).values([mine, mineSealed, theirs])
    const at = { createdAt: T0, updatedAt: T0 }
    await t.db.insert(vote).values([
      // Un voto que otro dio a mi entrada sin sellar: se va con ella.
      { userId: 'otro', entryId: mine.id, weekId: open, stars: 5, ...at },
      // Mis votos: el de la semana abierta se borra; el de la sellada, no (la clasificación no cambia).
      { userId: id, entryId: theirs.id, weekId: open, stars: 3, ...at },
      { userId: id, entryId: 'x', weekId: sealed, stars: 4, ...at },
      // Un voto de otro a mi entrada sellada: se queda.
      { userId: 'otro', entryId: mineSealed.id, weekId: sealed, stars: 2, ...at },
    ])
    const res = await t.app.inject({
      method: 'DELETE',
      url: '/api/me',
      headers: { cookie, origin: ORIGIN },
      payload: { confirm: 'aina' },
    })
    expect(res.statusCode).toBe(200)
    const entries = await t.db.select({ id: entry.id, userId: entry.userId }).from(entry)
    expect(entries).toEqual(
      expect.arrayContaining([
        { id: mineSealed.id, userId: `deleted:${mineSealed.id}` },
        { id: theirs.id, userId: 'otro' },
      ]),
    )
    expect(entries).toHaveLength(2)
    const votes = await t.db.select({ userId: vote.userId, entryId: vote.entryId }).from(vote)
    expect(votes).toEqual(
      expect.arrayContaining([
        { userId: id, entryId: 'x' },
        { userId: 'otro', entryId: mineSealed.id },
      ]),
    )
    expect(votes).toHaveLength(2)
  })
})
