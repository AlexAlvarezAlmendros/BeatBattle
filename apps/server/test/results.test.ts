import { rank } from '@beatbattle/rules'
import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { auditLog, entry, result, sample, user, vote, week } from '../src/db/schema'
import { sealWeek } from '../src/modules/weeks/seal'
import { type Battle, battle, HOUR, W42 } from './fixtures/battle'
import { json } from './fixtures/weeks'

// Cada prueba crea varias cuentas: en la CI pasa de los 5 s.
vi.setConfig({ testTimeout: 30_000 })

/** Resultados de la semana (tareas 6.3–6.8): sellado con clasificación, re-sellado, archivo y ceremonia. */

let b: Battle
afterEach(async () => {
  await b?.t.app.close()
})

/** Votos de cuentas sin fila (como los de otras personas), directamente en la BD. */
async function votes(entryId: string, stars: number[], prefix = 'v') {
  for (const [i, s] of stars.entries())
    await b.t.db.insert(vote).values({
      userId: `${prefix}-${entryId}-${i}`,
      entryId,
      weekId: b.weekId,
      stars: s,
      createdAt: W42.startsAt,
      updatedAt: W42.startsAt,
    })
}

const results = (cookie?: string) =>
  b.t.app.inject({
    method: 'GET',
    url: '/api/weeks/2026-w42/results',
    ...(cookie ? { headers: { cookie } } : {}),
  })

describe('el sellado clasifica (6.4, §2.8)', () => {
  it('RF-RES-04 / RF-RES-03: el snapshot es el de `rank` con los votos válidos; con < 3 votos, sin clasificar', async () => {
    b = await battle({ producers: 4, voters: 0 })
    const [a, c, d, e] = b.producers.map((p) => p.entryId) as [string, string, string, string]
    await votes(a, [5, 4, 4, 5])
    await votes(c, [3, 3, 3])
    await votes(d, [5, 5]) // dos de cinco: sin clasificar
    await votes(e, [1, 2, 2])
    expect((await results()).statusCode).toBe(404) // sin sellar, nada
    b.t.clock.set(W42.voteEndsAt)
    const res = await results()
    expect(res.statusCode).toBe(200)
    const data = res.json().data
    const expected = rank(
      (await b.t.db.select({ id: entry.id, submittedAt: entry.submittedAt }).from(entry)) as {
        id: string
        submittedAt: number
      }[],
      (await b.t.db.select({ entryId: vote.entryId, stars: vote.stars }).from(vote)) as {
        entryId: string
        stars: number
      }[],
    )
    expect(data.rows.map((row: { entry: { id: string } }) => row.entry.id)).toEqual(
      expected.map((row) => row.entryId),
    )
    expect(data.rows.find((row: { entry: { id: string } }) => row.entry.id === d).result).toMatchObject({
      position: null,
      votes: 2,
    })
    expect(data.week).toMatchObject({ slug: '2026-w42', revision: 1, correctedAt: null })
    const [w] = await b.t.db.select().from(week)
    expect(w).toMatchObject({ resultRevision: 1 })
    expect(w?.sealedAt).toBe(W42.voteEndsAt)
  })

  it('RF-RES-05: fuera los votos de cuentas bloqueadas, los anulados y las entradas retiradas o descalificadas', async () => {
    b = await battle({ producers: 3, voters: 1 })
    const [a, c, gone] = b.producers.map((p) => p.entryId) as [string, string, string]
    const voter = b.voters[0] as Battle['voters'][0]
    await votes(a, [3, 3, 3])
    await votes(c, [3, 3, 3])
    // El bloqueado le da un 5 a `c`: no cuenta.
    await b.t.db
      .insert(vote)
      .values({ userId: voter.id, entryId: c, weekId: b.weekId, stars: 5, createdAt: 1, updatedAt: 1 })
    await b.t.db.update(user).set({ banned: true }).where(eq(user.id, voter.id))
    // Un 5 anulado a `a`: tampoco.
    await b.t.db.insert(vote).values({
      userId: 'anulado',
      entryId: a,
      weekId: b.weekId,
      stars: 5,
      voided: true,
      createdAt: 1,
      updatedAt: 1,
    })
    await votes(gone, [5, 5, 5])
    await b.t.db.update(entry).set({ status: 'withdrawn' }).where(eq(entry.id, gone))
    b.t.clock.set(W42.voteEndsAt)
    const rows = (await results()).json().data.rows as {
      entry: { id: string }
      result: { position: number; votes: number }
    }[]
    expect(rows.map((row) => row.entry.id).sort()).toEqual([a, c].sort())
    for (const row of rows) expect(row.result).toMatchObject({ position: 1, votes: 3 })
  })

  it('RF-RES-04: dos sellados a la vez dejan un solo snapshot', async () => {
    b = await battle({ producers: 3, voters: 0 })
    for (const p of b.producers) await votes(p.entryId, [4, 3, 5])
    const now = W42.voteEndsAt
    const sealed = await Promise.all([
      sealWeek(b.t.db, { weekId: b.weekId, now, holder: 'uno' }),
      sealWeek(b.t.db, { weekId: b.weekId, now, holder: 'dos' }),
    ])
    expect(sealed.filter(Boolean)).toHaveLength(1)
    expect(await b.t.db.select().from(result)).toHaveLength(3)
  })

  it('RF-RES-10: una semana sin entradas se sella con el snapshot vacío', async () => {
    b = await battle({ producers: 0, voters: 0 })
    b.t.clock.set(W42.voteEndsAt)
    const res = await results()
    expect(res.statusCode).toBe(200)
    expect(res.json().data.rows).toEqual([])
  })
})

describe('la revelación y la ficha sellada (6.6)', () => {
  it('RF-RES-07 / RF-PLAY-08: tras el sellado, el productor y el resultado en la lista, la ficha y los resultados', async () => {
    b = await battle({ producers: 2, voters: 0 })
    const [a] = b.producers.map((p) => p.entryId) as [string]
    await votes(a, [5, 5, 4])
    const before = (await b.t.app.inject({ method: 'GET', url: `/api/entries/${a}` })).json().data
    expect(before).toMatchObject({ producer: null, result: null })
    b.t.clock.set(W42.voteEndsAt)
    await results()
    const after = (await b.t.app.inject({ method: 'GET', url: `/api/entries/${a}` })).json().data
    expect(after.producer).toMatchObject({ username: 'prod0' })
    expect(after.result).toEqual({
      position: 1,
      scoreMilli: expect.any(Number),
      votes: 3,
      histogram: [0, 0, 0, 1, 2],
      // La casilla del reto, ya sellada (`RF-ENT-13`).
      challengeClaimed: false,
    })
    const list = (await b.t.app.inject({ method: 'GET', url: '/api/weeks/2026-w42/entries' })).json().data
    expect(list.entries.find((e: { id: string }) => e.id === a).producer).toMatchObject({ username: 'prod0' })
  })

  it('RF-RES-08: «tu resultado» para quien participó', async () => {
    b = await battle({ producers: 2, voters: 1 })
    const own = b.producers[1] as Battle['producers'][0]
    await votes(own.entryId, [4, 4, 4])
    b.t.clock.set(W42.voteEndsAt)
    expect((await results(own.cookie)).json().data.mine).toMatchObject({
      entry: { id: own.entryId },
      result: { position: 1 },
    })
    expect((await results(b.voters[0]?.cookie)).json().data.mine).toBeNull()
  })
})

describe('re-sellado (6.3, 6.5)', () => {
  const admin = () => b.t.admin
  it('RF-RES-06: descalificar tras sellar y re-sellar → revisión 2, auditoría y aviso; sin cambios, el mismo snapshot', async () => {
    b = await battle({ producers: 3, voters: 1 })
    const [a, c, d] = b.producers.map((p) => p.entryId) as [string, string, string]
    await votes(a, [5, 5, 5])
    await votes(c, [4, 4, 4])
    await votes(d, [3, 3, 3])
    b.t.clock.set(W42.voteEndsAt)
    const first = (await results()).json().data.rows
    // Re-sellar sin cambios: la misma clasificación.
    const same = await b.t.app.inject({
      method: 'POST',
      url: '/api/admin/weeks/2026-w42/reseal',
      headers: { cookie: admin().cookie, origin: 'http://localhost:5173' },
    })
    expect(same.json().data).toEqual({ revision: 2 })
    expect((await results()).json().data.rows).toEqual(first)
    // Solo admin.
    const voter = b.voters[0] as Battle['voters'][0]
    const forbidden = await b.t.app.inject({
      method: 'POST',
      url: `/api/admin/entries/${a}/disqualify`,
      headers: json(voter.cookie),
      payload: { reason: 'rights' },
    })
    expect(forbidden.statusCode).toBe(403)
    // Plagio en el 1.º: fuera y re-sellar.
    const dq = await b.t.app.inject({
      method: 'POST',
      url: `/api/admin/entries/${a}/disqualify`,
      headers: json(admin().cookie),
      payload: { reason: 'rights', note: 'Es de otro tema' },
    })
    expect(dq.statusCode).toBe(204)
    b.t.clock.advance(60_000)
    const resealed = await b.t.app.inject({
      method: 'POST',
      url: '/api/admin/weeks/2026-w42/reseal',
      headers: { cookie: admin().cookie, origin: 'http://localhost:5173' },
    })
    expect(resealed.json().data).toEqual({ revision: 3 })
    const data = (await results()).json().data
    expect(data.week).toMatchObject({ revision: 3, correctedAt: W42.voteEndsAt + 60_000 })
    expect(
      data.rows.map((row: { entry: { id: string }; result: { position: number } }) => [
        row.entry.id,
        row.result.position,
      ]),
    ).toEqual([
      [c, 1],
      [d, 2],
    ])
    const audits = await b.t.db.select().from(auditLog).where(eq(auditLog.action, 'week.reseal'))
    expect(audits).toHaveLength(2)
    // La revisión 1 se conserva.
    expect((await b.t.db.select().from(result).where(eq(result.revision, 1))).length).toBe(3)
  })
})

describe('archivo y ceremonia (6.7, 6.8)', () => {
  it('RF-ARC-01: con 60 semanas selladas, la página 2 empieza en la 21.ª más reciente', async () => {
    b = await battle({ producers: 0, voters: 0 })
    const [s] = await b.t.db.select().from(sample)
    const base = Date.UTC(2020, 0, 6)
    for (let i = 0; i < 60; i++) {
      const startsAt = base + i * 7 * 86_400_000
      await b.t.db.insert(week).values({
        id: `old-${i}`,
        number: 100 + i,
        slug: `2020-w${String(i + 1).padStart(2, '0')}x`,
        seasonId: '2020-T1',
        sampleId: s?.id as string,
        rulesVersion: 1,
        startsAt,
        submitEndsAt: startsAt + 1000,
        voteEndsAt: startsAt + 2000,
        sealedAt: startsAt + 3000,
        resultRevision: 1,
        createdBy: 'admin',
        createdAt: 0,
      })
    }
    const page1 = (await b.t.app.inject({ method: 'GET', url: '/api/weeks' })).json().data
    expect(page1.weeks).toHaveLength(20)
    expect(page1.weeks[0].number).toBe(159)
    const page2 = (await b.t.app.inject({ method: 'GET', url: `/api/weeks?cursor=${page1.next}` })).json()
      .data
    expect(page2.weeks[0].number).toBe(139) // la 21.ª más reciente
    const page3 = (await b.t.app.inject({ method: 'GET', url: `/api/weeks?cursor=${page2.next}` })).json()
      .data
    expect(page3.weeks).toHaveLength(20)
    expect(page3.next).toBeNull()
  })

  it('RF-RES-09: la ceremonia se marca vista una vez por cuenta y semana, solo con la semana sellada', async () => {
    b = await battle({ producers: 1, voters: 1 })
    const voter = b.voters[0] as Battle['voters'][0]
    const seen = () =>
      b.t.app.inject({
        method: 'POST',
        url: '/api/me/seen',
        headers: json(voter.cookie),
        payload: { kind: 'ceremony', ref: '2026-w42' },
      })
    expect((await seen()).statusCode).toBe(404)
    b.t.clock.set(W42.voteEndsAt)
    const current = async () =>
      (
        await b.t.app.inject({ method: 'GET', url: '/api/weeks/current', headers: { cookie: voter.cookie } })
      ).json().data
    expect((await current()).sealed).toMatchObject({ slug: '2026-w42', ceremonySeen: false })
    expect((await seen()).statusCode).toBe(204)
    expect((await seen()).statusCode).toBe(204)
    expect((await current()).sealed).toMatchObject({ ceremonySeen: true })
    // Con el reloj antes del sellado (el de prueba puede ir y volver), ni ceremonia ni archivo.
    b.t.clock.set(W42.startsAt + HOUR)
    expect((await current()).sealed).toBeNull()
    expect((await b.t.app.inject({ method: 'GET', url: '/api/weeks' })).json().data.weeks).toEqual([])
  })
})
