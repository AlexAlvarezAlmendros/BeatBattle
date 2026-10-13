import { and, eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { entry, ipSignal, listen, report, user, vote, week } from '../src/db/schema'
import { type Battle, battle, entryValues, HOUR, listener, W42 } from './fixtures/battle'
import { json } from './fixtures/weeks'
import { createAccount } from './helpers'

let b: Battle
afterEach(async () => {
  await b?.t.app.close()
})

const list = (query = '', cookie?: string) =>
  b.t.app.inject({
    method: 'GET',
    url: `/api/weeks/2026-w42/entries${query}`,
    ...(cookie ? { headers: { cookie } } : {}),
  })

/** Votos de otras cuentas, directamente en la BD (para ordenar). */
async function seedVotes(entryId: string, n: number) {
  for (let i = 0; i < n; i++)
    await b.t.db.insert(vote).values({
      userId: `seed-${entryId}-${i}`,
      entryId,
      weekId: b.weekId,
      stars: 3,
      createdAt: W42.startsAt,
      updatedAt: W42.startsAt,
    })
}

describe('la lista de la semana (5.3, §2.6)', () => {
  it('RF-PLAY-04: con 3 entradas de 0, 5 y 2 votos, quien no ha votado ninguna las ve 0, 2, 5', async () => {
    b = await battle({ producers: 3, voters: 1 })
    const [zero, five, two] = b.producers.map((p) => p.entryId) as [string, string, string]
    await seedVotes(five, 5)
    await seedVotes(two, 2)
    const res = await list('', b.voters[0]?.cookie)
    expect(res.statusCode).toBe(200)
    expect(res.json().data.order).toBe('fair')
    expect(res.json().data.entries.map((e: { id: string }) => e.id)).toEqual([zero, two, five])
    // Sin sesión, el mismo criterio con el barajado del día.
    expect((await list()).json().data.entries.map((e: { id: string }) => e.id)).toEqual([zero, two, five])
  })

  it('RF-PLAY-04: con sesión, las votadas van al final y llevan `myVote`; la propia, `mine`', async () => {
    b = await battle({ producers: 3, voters: 0 })
    const [me, a, c] = b.producers as [Battle['producers'][0], Battle['producers'][0], Battle['producers'][0]]
    const ear = listener(b.t, me.cookie)
    await ear.ready(a.entryId)
    expect((await ear.vote(a.entryId, 4)).statusCode).toBe(200)
    const entries = (await list('', me.cookie)).json().data.entries
    expect(entries.at(-1)).toMatchObject({ id: a.entryId, myVote: 4, mine: false })
    expect(entries.find((e: { id: string }) => e.id === me.entryId)).toMatchObject({
      mine: true,
      myVote: null,
    })
    const unvoted = (await list('?unvoted=1', me.cookie)).json().data.entries
    expect(unvoted.map((e: { id: string }) => e.id)).toEqual([c.entryId])
  })

  it('filtros por género, BPM y tonalidad; «Recién subidas» y «Aleatorio» con semilla', async () => {
    b = await battle({ producers: 0, voters: 1 })
    const rows = [
      entryValues(b.weekId, 'u1', { tags: JSON.stringify(['Drill']), bpm: 142, musicalKey: 'Dm' }),
      entryValues(b.weekId, 'u2', { tags: JSON.stringify(['Trap', 'Club']), bpm: 95, musicalKey: 'Am' }),
      entryValues(b.weekId, 'u3', { tags: JSON.stringify(['Trap']), bpm: null, musicalKey: null }),
    ]
    await b.t.db.insert(entry).values(rows)
    const ids = async (q: string) => (await list(q)).json().data.entries.map((e: { id: string }) => e.id)
    expect(await ids('?genre=Trap')).toHaveLength(2)
    expect(await ids('?bpm=90-100')).toEqual([rows[1]?.id])
    expect(await ids('?key=Dm')).toEqual([rows[0]?.id])
    expect(await ids('?order=new')).toEqual([rows[2]?.id, rows[1]?.id, rows[0]?.id])
    expect(await ids('?order=random&seed=7')).toEqual(await ids('?order=random&seed=7'))
    expect((await list('?order=top')).statusCode).toBe(422)
    expect((await list()).json().data.total).toBe(3)
  })

  it('RF-PLAY-05 y RF-VOTE-07: sin sellar y ciega, sin autoría, medias, recuentos ni posiciones; ocultas y retiradas fuera', async () => {
    b = await battle({ producers: 2, voters: 0 })
    const [a, c] = b.producers as [Battle['producers'][0], Battle['producers'][0]]
    await seedVotes(a.entryId, 4)
    await b.t.db.update(entry).set({ status: 'hidden' }).where(eq(entry.id, c.entryId))
    const res = await list()
    const body = res.body
    expect(res.json().data.entries.map((e: { id: string }) => e.id)).toEqual([a.entryId])
    for (const trace of [a.id, c.id, 'prod0', 'prod1', '"position"', '"mean', '"score', '"votes"'])
      expect(body.includes(trace), trace).toBe(false)
    expect(res.json().data.entries[0].producer).toBeNull()
    // Sellada, la autoría aparece.
    await b.t.db.update(week).set({ sealedAt: W42.voteEndsAt }).where(eq(week.id, b.weekId))
    expect((await list()).json().data.entries[0].producer).toMatchObject({ username: 'prod0' })
  })

  it('antes del drop, la lista no existe (404)', async () => {
    b = await battle({ producers: 1, voters: 0 })
    b.t.clock.set(W42.startsAt - 1)
    expect((await list()).statusCode).toBe(404)
  })
})

describe('el recibo de escucha (5.4, §4.7.3)', () => {
  it('RF-VOTE-04: sin escucha → 409; a los 20 s de una entrada de 3 min → 409; a los 31 s → 200', async () => {
    b = await battle({ producers: 1, voters: 1 })
    const target = b.producers[0]?.entryId as string
    const ear = listener(b.t, b.voters[0]?.cookie as string)
    const none = await ear.vote(target, 4)
    expect(none.statusCode).toBe(409)
    expect(none.json().error).toMatchObject({ code: 'LISTEN_REQUIRED', details: { remainingMs: 30_000 } })

    const started = await ear.listen(target)
    expect(started.json().data).toMatchObject({ thresholdMs: 30_000, startedAt: b.t.clock.now() })
    const { listenId } = started.json().data
    b.t.clock.advance(20_000)
    const early = await ear.qualify(target, listenId)
    expect(early.statusCode).toBe(409)
    expect(early.json().error).toMatchObject({ code: 'LISTEN_REQUIRED', details: { remainingMs: 10_000 } })
    expect((await ear.vote(target, 4)).json().error.code).toBe('LISTEN_REQUIRED')
    // Volver a empezar no reinicia el reloj.
    expect((await ear.listen(target)).json().data.listenId).toBe(listenId)
    b.t.clock.advance(11_000)
    expect((await ear.qualify(target, listenId)).statusCode).toBe(200)
    expect((await ear.vote(target, 4)).statusCode).toBe(200)
  })

  it('RF-VOTE-04: el recibo es de quien escucha y de esa entrada', async () => {
    b = await battle({ producers: 2, voters: 2 })
    const [a, c] = b.producers.map((p) => p.entryId) as [string, string]
    const one = listener(b.t, b.voters[0]?.cookie as string)
    const other = listener(b.t, b.voters[1]?.cookie as string)
    const { listenId } = (await one.listen(a)).json().data
    b.t.clock.advance(31_000)
    expect((await other.qualify(a, listenId)).statusCode).toBe(409)
    expect((await one.qualify(c, listenId)).statusCode).toBe(409)
    expect((await other.vote(a, 5)).json().error.code).toBe('LISTEN_REQUIRED')
  })
})

describe('el voto (5.5, §2.7)', () => {
  it('RF-VOTE-01: `stars` 0, 6 o 3.5 → 422', async () => {
    b = await battle({ producers: 1, voters: 1 })
    const ear = listener(b.t, b.voters[0]?.cookie as string)
    const target = b.producers[0]?.entryId as string
    await ear.ready(target)
    for (const stars of [0, 6, 3.5]) {
      const res = await ear.vote(target, stars)
      expect(res.statusCode, String(stars)).toBe(422)
    }
  })

  it('RF-VOTE-02: votar 3 y después 5 deja un único voto de 5 con `updated_at` nuevo', async () => {
    b = await battle({ producers: 1, voters: 1 })
    const ear = listener(b.t, b.voters[0]?.cookie as string)
    const target = b.producers[0]?.entryId as string
    await ear.ready(target)
    const first = (await ear.vote(target, 3)).json().data
    b.t.clock.advance(5000)
    const second = (await ear.vote(target, 5)).json().data
    expect(second).toMatchObject({ stars: 5, createdAt: first.createdAt, updatedAt: first.updatedAt + 5000 })
    const rows = await b.t.db.select().from(vote).where(eq(vote.entryId, target))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ stars: 5, updatedAt: first.updatedAt + 5000 })
  })

  it('RF-VOTE-03: no se vota la propia entrada → 403 OWN_ENTRY (ni se escucha para votarla)', async () => {
    b = await battle({ producers: 1, voters: 0 })
    const me = b.producers[0] as Battle['producers'][0]
    const ear = listener(b.t, me.cookie)
    expect((await ear.listen(me.entryId)).json().error.code).toBe('OWN_ENTRY')
    const res = await ear.vote(me.entryId, 5)
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('OWN_ENTRY')
  })

  it('RF-VOTE-05: tras el cierre de votos → 409 VOTING_CLOSED aunque el sellado no haya terminado', async () => {
    b = await battle({ producers: 1, voters: 1 })
    const ear = listener(b.t, b.voters[0]?.cookie as string)
    const target = b.producers[0]?.entryId as string
    await ear.ready(target)
    b.t.clock.set(W42.submitEndsAt + HOUR)
    expect((await ear.vote(target, 4)).statusCode).toBe(200)
    b.t.clock.set(W42.voteEndsAt)
    const [w] = await b.t.db.select({ sealedAt: week.sealedAt }).from(week)
    expect(w?.sealedAt).toBeNull()
    const closed = await ear.vote(target, 2)
    expect(closed.statusCode).toBe(409)
    expect(closed.json().error.code).toBe('VOTING_CLOSED')
    expect((await ear.unvote(target)).json().error.code).toBe('VOTING_CLOSED')
  })

  it('RF-VOTE-06: sin verificar → 403 EMAIL_NOT_VERIFIED; bloqueada → 401', async () => {
    b = await battle({ producers: 1, voters: 1 })
    const target = b.producers[0]?.entryId as string
    const fresh = await createAccount(b.t, { email: 'nueva@example.com', username: 'nueva', verify: false })
    const unverified = await listener(b.t, fresh.cookie).vote(target, 4)
    expect(unverified.statusCode).toBe(403)
    expect(unverified.json().error.code).toBe('EMAIL_NOT_VERIFIED')
    const voter = b.voters[0] as Battle['voters'][0]
    await listener(b.t, voter.cookie).ready(target)
    await b.t.db.update(user).set({ banned: true }).where(eq(user.id, voter.id))
    expect((await listener(b.t, voter.cookie).vote(target, 4)).statusCode).toBe(401)
  })

  it('RF-VOTE-11: el voto 121 dentro de la hora → 429', async () => {
    b = await battle({ producers: 1, voters: 1 })
    const ear = listener(b.t, b.voters[0]?.cookie as string)
    const target = b.producers[0]?.entryId as string
    await ear.ready(target)
    for (let i = 0; i < 120; i++) expect((await ear.vote(target, (i % 5) + 1)).statusCode).toBe(200)
    const limited = await ear.vote(target, 3)
    expect(limited.statusCode).toBe(429)
    expect(limited.headers['retry-after']).toBeDefined()
  })

  it('RF-VOTE-13: quitar el voto → 204 y la entrada vuelve a la cola del Modo Jurado', async () => {
    b = await battle({ producers: 2, voters: 1 })
    const voter = b.voters[0] as Battle['voters'][0]
    const ear = listener(b.t, voter.cookie)
    const target = b.producers[0]?.entryId as string
    await ear.ready(target)
    await ear.vote(target, 4)
    const queue = async () =>
      (
        await b.t.app.inject({ method: 'GET', url: '/api/jury/queue', headers: { cookie: voter.cookie } })
      ).json().data
    expect((await queue()).queue.map((e: { id: string }) => e.id)).not.toContain(target)
    expect((await ear.unvote(target)).statusCode).toBe(204)
    expect(await b.t.db.select().from(vote).where(eq(vote.entryId, target))).toEqual([])
    expect((await queue()).queue.map((e: { id: string }) => e.id)).toContain(target)
  })

  it('§2.13: el voto deja la señal de IP (hash con sal, nunca la IP)', async () => {
    b = await battle({ producers: 1, voters: 1 })
    const voter = b.voters[0] as Battle['voters'][0]
    const target = b.producers[0]?.entryId as string
    await listener(b.t, voter.cookie).ready(target)
    await b.t.app.inject({
      method: 'PUT',
      url: `/api/entries/${target}/vote`,
      headers: json(voter.cookie),
      remoteAddress: '203.0.113.9',
      payload: { stars: 4 },
    })
    const signals = await b.t.db.select().from(ipSignal).where(eq(ipSignal.userId, voter.id))
    expect(signals).toHaveLength(1)
    expect(signals[0]?.ipHash).toMatch(/^[0-9a-f]{32}$/)
    expect(JSON.stringify(signals)).not.toContain('203.0.113.9')
  })

  it('una entrada oculta o retirada no se vota ni se escucha (404)', async () => {
    b = await battle({ producers: 1, voters: 1 })
    const ear = listener(b.t, b.voters[0]?.cookie as string)
    const target = b.producers[0]?.entryId as string
    await ear.ready(target)
    await b.t.db.update(entry).set({ status: 'hidden' }).where(eq(entry.id, target))
    expect((await ear.vote(target, 4)).statusCode).toBe(404)
    expect((await ear.listen(target)).statusCode).toBe(404)
  })
})

describe('denunciar (5.6, §2.7)', () => {
  it('RF-VOTE-12: denuncia con motivo, una por usuario y entrada; la segunda → 409', async () => {
    b = await battle({ producers: 1, voters: 1 })
    const ear = listener(b.t, b.voters[0]?.cookie as string)
    const target = b.producers[0]?.entryId as string
    expect((await ear.report(target, { reason: 'feo' })).statusCode).toBe(422)
    expect((await ear.report(target, { reason: 'rights', details: 'Es de otro tema' })).statusCode).toBe(201)
    const again = await ear.report(target, { reason: 'spam' })
    expect(again.statusCode).toBe(409)
    expect(again.json().error.code).toBe('REPORT_EXISTS')
    const rows = await b.t.db.select().from(report)
    expect(rows).toEqual([
      expect.objectContaining({ reason: 'rights', details: 'Es de otro tema', status: 'open' }),
    ])
    // La propia no se denuncia.
    const own = b.producers[0] as Battle['producers'][0]
    expect((await listener(b.t, own.cookie).report(own.entryId, { reason: 'spam' })).statusCode).toBe(403)
  })
})

describe('escuchas y estadísticas del dueño (5.7)', () => {
  const play = (entryId: string, playId: string, ip = '203.0.113.20') =>
    b.t.app.inject({
      method: 'POST',
      url: `/api/entries/${entryId}/play`,
      headers: { origin: 'http://localhost:5173', 'content-type': 'application/json' },
      remoteAddress: ip,
      payload: { playId },
    })
  const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

  it('RF-PLAY-07: una escucha por sesión de escucha, y como mucho 3 por hora desde la misma IP', async () => {
    b = await battle({ producers: 1, voters: 0 })
    const target = b.producers[0]?.entryId as string
    const plays = async () => (await b.t.db.select().from(entry).where(eq(entry.id, target)))[0]?.playCount
    expect((await play(target, uuid(1))).statusCode).toBe(202)
    expect((await play(target, uuid(1))).statusCode).toBe(202)
    expect(await plays()).toBe(1)
    for (const n of [2, 3, 4]) await play(target, uuid(n))
    expect(await plays()).toBe(3)
    await play(target, uuid(5), '203.0.113.21')
    expect(await plays()).toBe(4)
    expect((await play(target, 'no-es-un-uuid')).statusCode).toBe(422)
  })

  it('RF-PLAY-05: el dueño ve votos y escuchas, sin media; nadie más', async () => {
    b = await battle({ producers: 1, voters: 1 })
    const own = b.producers[0] as Battle['producers'][0]
    await seedVotes(own.entryId, 2)
    await play(own.entryId, uuid(9))
    const res = await b.t.app.inject({
      method: 'GET',
      url: `/api/entries/${own.entryId}/stats`,
      headers: { cookie: own.cookie },
    })
    expect(res.json().data).toEqual({ votes: 2, plays: 1 })
    const other = await b.t.app.inject({
      method: 'GET',
      url: `/api/entries/${own.entryId}/stats`,
      headers: { cookie: b.voters[0]?.cookie as string },
    })
    expect(other.statusCode).toBe(404)
  })
})

describe('cola del Modo Jurado y mis votos (5.8)', () => {
  it('RF-VOTE-09: la cola no lleva la propia ni las votadas, va en Ronda justa y dice la ronda', async () => {
    b = await battle({ producers: 4, voters: 0 })
    const [me, a, c, d] = b.producers as Battle['producers']
    await seedVotes((c as Battle['producers'][0]).entryId, 3)
    const ear = listener(b.t, (me as Battle['producers'][0]).cookie)
    await ear.ready((a as Battle['producers'][0]).entryId)
    await ear.vote((a as Battle['producers'][0]).entryId, 5)
    const res = await b.t.app.inject({
      method: 'GET',
      url: '/api/jury/queue',
      headers: { cookie: (me as Battle['producers'][0]).cookie },
    })
    const data = res.json().data
    expect(data.weekSlug).toBe('2026-w42')
    expect(data.round).toEqual({ done: 1, total: 3 })
    expect(data.queue.map((e: { id: string }) => e.id)).toEqual([
      (d as Battle['producers'][0]).entryId,
      (c as Battle['producers'][0]).entryId,
    ])
    for (const item of data.queue) expect(item.producer).toBeNull()

    const mine = await b.t.app.inject({
      method: 'GET',
      url: '/api/me/votes',
      headers: { cookie: (me as Battle['producers'][0]).cookie },
    })
    expect(mine.json().data.votes).toEqual([
      expect.objectContaining({ entryId: (a as Battle['producers'][0]).entryId, stars: 5 }),
    ])
  })

  it('RF-VOTE-09: con las votaciones cerradas la cola queda vacía; sin cuenta verificada, nada', async () => {
    b = await battle({ producers: 2, voters: 1 })
    const voter = b.voters[0] as Battle['voters'][0]
    b.t.clock.set(W42.voteEndsAt - 1)
    const open = await b.t.app.inject({
      method: 'GET',
      url: '/api/jury/queue?week=2026-w42',
      headers: { cookie: voter.cookie },
    })
    expect(open.json().data.queue).toHaveLength(2)
    b.t.clock.set(W42.voteEndsAt)
    const closed = await b.t.app.inject({
      method: 'GET',
      url: '/api/jury/queue?week=2026-w42',
      headers: { cookie: voter.cookie },
    })
    expect(closed.json().data.queue).toEqual([])
    expect((await b.t.app.inject({ method: 'GET', url: '/api/jury/queue' })).statusCode).toBe(401)
  })
})

describe('el recibo se pierde con el audio (5.2)', () => {
  it('RF-VOTE-04: retirar la entrada borra sus recibos de escucha', async () => {
    b = await battle({ producers: 1, voters: 1 })
    const own = b.producers[0] as Battle['producers'][0]
    await listener(b.t, b.voters[0]?.cookie as string).ready(own.entryId)
    const res = await b.t.app.inject({
      method: 'DELETE',
      url: `/api/entries/${own.entryId}`,
      headers: { cookie: own.cookie, origin: 'http://localhost:5173' },
    })
    expect(res.statusCode).toBe(204)
    expect(
      await b.t.db
        .select()
        .from(listen)
        .where(and(eq(listen.entryId, own.entryId))),
    ).toEqual([])
  })
})

describe('la crónica de la arena (5.9, §3.8.3)', () => {
  const ticker = (q = '') => b.t.app.inject({ method: 'GET', url: `/api/weeks/2026-w42/ticker${q}` })

  it('RF-PLAY-05: entradas por alias, días que quedan y votos de la semana; nunca autoría ni cifras de una entrada', async () => {
    b = await battle({ producers: 2, voters: 0 })
    await seedVotes(b.producers[0]?.entryId as string, 3)
    await seedVotes(b.producers[1]?.entryId as string, 1)
    const res = await ticker()
    expect(res.statusCode).toBe(200)
    const { events } = res.json().data
    const aliases = await b.t.db.select({ id: entry.id, alias: entry.alias }).from(entry)
    const aliasOf = (i: number) => aliases.find((row) => row.id === b.producers[i]?.entryId)?.alias
    // La más reciente primero.
    expect(
      events.filter((e: { kind: string }) => e.kind === 'entry').map((e: { alias: string }) => e.alias),
    ).toEqual([aliasOf(1), aliasOf(0)])
    // Lunes 01:00 → domingo 20:00: 6 días y 19 h.
    expect(events).toContainEqual({ kind: 'closing', phase: 'submit', days: 6 })
    expect(events).toContainEqual({ kind: 'votes', count: 4 })
    for (const trace of [b.producers[0]?.id, b.producers[1]?.id, 'prod0', 'prod1'])
      expect(res.body.includes(String(trace)), String(trace)).toBe(false)
  })

  it('con `since`, solo lo nuevo; en `voting`, cuenta hasta el cierre de votos; antes del drop, 404', async () => {
    b = await battle({ producers: 1, voters: 0 })
    const first = (await ticker()).json().data
    const later = (await ticker(`?since=${first.now}`)).json().data.events
    expect(later.filter((e: { kind: string }) => e.kind === 'entry')).toEqual([])
    b.t.clock.set(W42.voteEndsAt - 2 * HOUR)
    expect((await ticker()).json().data.events).toContainEqual({ kind: 'closing', phase: 'vote', days: 0 })
    b.t.clock.set(W42.startsAt - 1)
    expect((await ticker()).statusCode).toBe(404)
  })
})
