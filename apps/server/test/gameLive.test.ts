import { scheduleWeek as boundaries, LEVEL_MAX, xpForLevel } from '@beatbattle/rules'
import { and, eq, sql } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runBatch } from '../src/db/batch'
import { achievementUnlock, entry, producerProfile, result, vote, week, xpEvent } from '../src/db/schema'
import { type AudioMeasurement, measureAudio } from '../src/media/measure'
import { createGameService } from '../src/modules/game/service'
import { type Battle, battle, entryValues, HOUR, listener, W42 } from './fixtures/battle'
import { sineWav } from './fixtures/wav'
import { createSample, json, makeWeeksApp, scheduleWeek, type WeeksApp } from './fixtures/weeks'
import { createAccount } from './helpers'

// Cada prueba crea varias cuentas y sube audio: en la CI pasa de los 5 s.
vi.setConfig({ testTimeout: 30_000 })

/**
 * La capa de juego en vivo (guía §2.10, §4.11; tarea 7.9): el XP y los logros de cada hecho en su propio `batch`
 * (la entrada que pasa a `active`, el voto, la descarga del sample y el perfil), y lo ganado en la respuesta.
 */

let t: WeeksApp | undefined
let b: Battle | undefined
afterEach(async () => {
  await t?.app.close()
  await b?.t.app.close()
  t = undefined
  b = undefined
})

const app = () => (t ?? b?.t) as WeeksApp

const ledger = (userId: string) =>
  app().db.select().from(xpEvent).where(eq(xpEvent.userId, userId)).orderBy(xpEvent.kind, xpEvent.ref)
const unlocks = async (userId: string) =>
  (
    await app()
      .db.select({ id: achievementUnlock.achievementId })
      .from(achievementUnlock)
      .where(eq(achievementUnlock.userId, userId))
  )
    .map((row) => row.id)
    .sort()
const cachedXp = async (userId: string) =>
  (
    await app()
      .db.select({ xp: producerProfile.xp })
      .from(producerProfile)
      .where(eq(producerProfile.userId, userId))
  )[0]?.xp
const ledgerSum = async (userId: string) =>
  Number(
    (
      await app()
        .db.select({ n: sql<number>`coalesce(sum(${xpEvent.amount}), 0)` })
        .from(xpEvent)
        .where(eq(xpEvent.userId, userId))
    )[0]?.n,
  )

// ─── Subir ──────────────────────────────────────────────────────────────────────────────────────────────────────

const beat = (seconds = 31) => sineWav({ seconds, sampleRate: 8000, channels: 1 })
const CRON_SECRET = 'cron-secret-de-prueba-0123456789abcdef'

const ficha = {
  title: 'Bruma en Gràcia',
  bpm: 140,
  musicalKey: 'Am',
  daw: 'FL Studio',
  genres: ['Trap'],
  description: null,
  declaration: true,
}

/** Dos semanas selladas antes de la 42 (la 40 y la 41), con sus fronteras: la 42 será la número 3. */
const W40 = boundaries({ year: 2026, month: 9, day: 28 })
const W41 = boundaries({ year: 2026, month: 10, day: 5 })

async function sealedBefore(sampleId: string) {
  const rows = [
    { id: 'w40', number: 1, slug: '2026-w40', bounds: W40 },
    { id: 'w41', number: 2, slug: '2026-w41', bounds: W41 },
  ]
  for (const row of rows)
    await app()
      .db.insert(week)
      .values({
        id: row.id,
        number: row.number,
        slug: row.slug,
        // La temporada de su lunes (`RF-ARC-04`): la 40 (28 de septiembre) es de la 2026-T3.
        seasonId: row.id === 'w40' ? '2026-T3' : '2026-T4',
        sampleId,
        rulesVersion: 1,
        ...row.bounds,
        sealedAt: row.bounds.voteEndsAt,
        resultRevision: 1,
        createdBy: 'test',
        createdAt: 0,
      })
}

/** Una entrada clasificada de `userId` en una semana ya sellada (su fila de `result` en la revisión 1). */
async function qualifiedIn(weekId: string, userId: string, position = 2) {
  const values = entryValues(weekId, userId)
  await app().db.insert(entry).values(values)
  await app()
    .db.insert(result)
    .values({
      weekId,
      revision: 1,
      entryId: values.id,
      position,
      scoreMilli: 4000,
      votes: 5,
      meanMilli: 4000,
      medianHalf: 8,
      histogram: JSON.stringify([0, 0, 0, 5, 0]),
      seasonPoints: 18,
    })
}

async function openWeek({
  golden = false,
  history = false,
  measure,
  measureBudgetMs,
}: {
  golden?: boolean
  history?: boolean
  measure?: (source: ReadableStream<Uint8Array>) => Promise<AudioMeasurement>
  measureBudgetMs?: number
} = {}) {
  t = await makeWeeksApp({ cronSecret: CRON_SECRET }, { measure, measureBudgetMs })
  const { id: sampleId } = await createSample(t)
  if (history) await sealedBefore(sampleId)
  await scheduleWeek(t, '2026-10-12', sampleId)
  if (golden) await t.db.update(week).set({ golden: true }).where(eq(week.slug, '2026-w42'))
  t.clock.set(W42.startsAt + HOUR)
}

async function producer(username: string) {
  const account = await createAccount(app(), { email: `${username}@example.com`, username })
  await app().app.inject({
    method: 'POST',
    url: '/api/weeks/2026-w42/rules',
    headers: json(account.cookie),
    payload: { rulesVersion: 1 },
  })
  return account
}

/** Firma, «sube» al almacenamiento falso y registra la entrada, como el navegador. */
async function submit(cookie: string, bytes: Uint8Array = beat()) {
  const signed = await app().app.inject({
    method: 'POST',
    url: '/api/uploads/sign',
    headers: json(cookie),
    payload: {
      kind: 'entry',
      weekSlug: '2026-w42',
      mime: 'audio/wav',
      bytes: bytes.byteLength,
      durationMs: 31_000,
    },
  })
  expect(signed.statusCode, signed.body).toBe(200)
  const { intentId, publicId } = signed.json().data
  await app().storage.put({ publicId, bytes, format: 'wav', nowMs: app().clock.now() })
  const res = await app().app.inject({
    method: 'POST',
    url: '/api/weeks/2026-w42/entries',
    headers: json(cookie),
    payload: { intentId, ...ficha },
  })
  expect(res.statusCode, res.body).toBe(201)
  return res.json().data
}

describe('la entrada que pasa a `active` (7.9, §2.10, §4.8.4)', () => {
  it('RF-GAME-05: subir da 100 XP, la primera entrada de la semana +25 con early_bird, y first_entry; la respuesta lo dice', async () => {
    await openWeek()
    const lil = await producer('lilbru')
    const aina = await producer('aina')
    const first = await submit(lil.cookie)
    expect(first.status).toBe('active')
    // 100 (subir, racha en juego 1) + 25 (primera de la semana) + first_entry 25 + early_bird 75.
    expect(first.game).toEqual({ xp: 225, achievements: ['first_entry', 'early_bird'], level: 2 })
    const second = await submit(aina.cookie, beat(33))
    expect(second.game).toEqual({ xp: 125, achievements: ['first_entry'], level: 1 })
    expect((await ledger(lil.id)).map((r) => [r.kind, r.amount])).toEqual([
      ['achievement', 75],
      ['achievement', 25],
      ['entry', 100],
      ['first_entry_of_week', 25],
    ])
    expect(await unlocks(aina.id)).toEqual(['first_entry'])
    expect(await cachedXp(lil.id)).toBe(225)
    expect(await cachedXp(aina.id)).toBe(125)
  })

  it('RF-GAME-01: subir paga una vez por semana: sustituir el audio de la entrada activa no suma', async () => {
    await openWeek()
    const lil = await producer('lilbru')
    const own = await submit(lil.cookie)
    const signed = await app().app.inject({
      method: 'POST',
      url: '/api/uploads/sign',
      headers: json(lil.cookie),
      payload: {
        kind: 'entry',
        weekSlug: '2026-w42',
        mime: 'audio/wav',
        bytes: beat(35).byteLength,
        durationMs: 35_000,
        replacing: own.id,
      },
    })
    const { intentId, publicId } = signed.json().data
    await app().storage.put({ publicId, bytes: beat(35), format: 'wav', nowMs: app().clock.now() })
    const replaced = await app().app.inject({
      method: 'PUT',
      url: `/api/entries/${own.id}/audio`,
      headers: json(lil.cookie),
      payload: { intentId },
    })
    expect(replaced.statusCode, replaced.body).toBe(200)
    expect(replaced.json().data.game).toEqual({ xp: 0, achievements: [], level: 2 })
    expect(await ledgerSum(lil.id)).toBe(225)
  })

  it('§2.10: el XP de subir lleva el bonus de la racha en juego (las semanas selladas más esta) y la semana dorada lo duplica', async () => {
    await openWeek({ history: true, golden: true })
    const lil = await producer('lilbru')
    await qualifiedIn('w40', lil.id)
    await qualifiedIn('w41', lil.id)
    const own = await submit(lil.cookie)
    // Racha en juego 3 → +20 %: 120, × 2 en dorada = 240; la primera entrada, 25 × 2 = 50. Los logros, sin dorada:
    // first_entry 25, early_bird 75 y golden_week 150.
    expect(own.game).toEqual({
      xp: 240 + 50 + 25 + 75 + 150,
      achievements: ['first_entry', 'early_bird', 'golden_week'],
      level: 3,
    })
    const rows = await ledger(lil.id)
    expect(rows.find((r) => r.kind === 'entry')).toMatchObject({ amount: 240 })
    expect(rows.find((r) => r.kind === 'first_entry_of_week')).toMatchObject({ amount: 50 })
  })

  it('RF-GAME-04: el comodín salva la semana fallada sin sumar: la racha en juego sigue la de antes más esta', async () => {
    await openWeek({ history: true })
    const lil = await producer('lilbru')
    await qualifiedIn('w40', lil.id)
    // En la 41 no tiene entrada: gasta el comodín de la temporada y la racha se queda en 1.
    const own = await submit(lil.cookie)
    // En juego, 2 → +10 %: 110.
    expect((await ledger(lil.id)).find((r) => r.kind === 'entry')).toMatchObject({ amount: 110 })
    expect(own.game.xp).toBe(110 + 25 + 25 + 75)
  })

  it('RF-GAME-05: last_minute (en los 10 min antes del cierre de envíos) y entries_10 con 9 semanas antes en el libro', async () => {
    await openWeek()
    const lil = await producer('lilbru')
    for (let i = 0; i < 9; i++)
      await app()
        .db.insert(xpEvent)
        .values({
          id: `old-${i}`,
          userId: lil.id,
          kind: 'entry',
          ref: `w-old-${i}`,
          weekId: `w-old-${i}`,
          amount: 100,
          createdAt: 0,
        })
    app().clock.set(W42.submitEndsAt - 5 * 60_000)
    const own = await submit(lil.cookie)
    expect(own.game.achievements).toEqual(['first_entry', 'early_bird', 'entries_10', 'last_minute'])
  })

  it('§4.8.4: en `processing` no gana nada todavía; el tick que la activa paga subir en su batch', async () => {
    // El sample se mide de verdad al crearlo; la entrada, no (se queda en `processing`).
    let mode: 'real' | 'hang' = 'real'
    await openWeek({
      measure: (source) => (mode === 'hang' ? new Promise(() => {}) : measureAudio(source)),
      measureBudgetMs: 30,
    })
    mode = 'hang'
    const lil = await producer('lilbru')
    const own = await submit(lil.cookie)
    expect(own.status).toBe('processing')
    expect(own.game).toEqual({ xp: 0, achievements: [], level: 1 })
    expect(await ledger(lil.id)).toEqual([])
    mode = 'real'
    const tick = await app().app.inject({
      method: 'GET',
      url: '/api/cron/tick',
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    })
    expect(tick.json().data.entries).toMatchObject({ processingCompleted: 1 })
    expect(await ledgerSum(lil.id)).toBe(225)
    expect(await unlocks(lil.id)).toEqual(['early_bird', 'first_entry'])
  })

  it('§4.11: sin el hecho no queda nada: lo de una entrada que no está activa no se escribe', async () => {
    await openWeek()
    const lil = await producer('lilbru')
    const [w] = await app().db.select().from(week).where(eq(week.slug, '2026-w42'))
    const values = entryValues(w?.id as string, lil.id, { status: 'processing' })
    await app().db.insert(entry).values(values)
    let n = 0
    const game = createGameService({ db: app().db, newId: () => `g-${++n}` })
    const plan = await game.entryActivated(lil.id, {
      entryId: values.id,
      week: { id: w?.id as string, number: 1, golden: false, submitEndsAt: W42.submitEndsAt },
      submittedAt: values.submittedAt,
      now: app().clock.now(),
    })
    expect(plan.delta.xp).toBeGreaterThan(0) // la vista previa
    await runBatch(app().db, plan.statements)
    expect(await ledger(lil.id)).toEqual([])
    expect(await unlocks(lil.id)).toEqual([])
  })
})

// ─── Votar ──────────────────────────────────────────────────────────────────────────────────────────────────────

describe('el voto (7.9, §2.7, §2.10)', () => {
  it('RF-GAME-08 (servidor): votar responde «+5 XP» y el primer veredicto; cambiar la nota, quitar y volver a votar no suman', async () => {
    b = await battle({ producers: 2, voters: 1 })
    const voter = b.voters[0] as Battle['voters'][0]
    const [a] = b.producers.map((p) => p.entryId) as [string]
    const l = listener(b.t, voter.cookie)
    await l.ready(a)
    const first = await l.vote(a, 4)
    expect(first.statusCode, first.body).toBe(200)
    expect(first.json().data).toMatchObject({
      entryId: a,
      stars: 4,
      game: { xp: 5 + 25, achievements: ['first_vote'], level: 1 },
    })
    expect((await l.vote(a, 5)).json().data.game).toEqual({ xp: 0, achievements: [], level: 1 })
    expect((await l.unvote(a)).statusCode).toBe(204)
    await l.ready(a)
    expect((await l.vote(a, 2)).json().data.game).toEqual({ xp: 0, achievements: [], level: 1 })
    expect((await ledger(voter.id)).map((r) => [r.kind, r.ref, r.amount])).toEqual([
      ['achievement', 'first_vote', 25],
      ['vote', a, 5],
    ])
    expect(await cachedXp(voter.id)).toBe(30)
  })

  it('RF-GAME-03: el XP del voto lleva el tope del libro: con 40 votos con XP esta semana, el siguiente no suma', async () => {
    b = await battle({ producers: 2, voters: 1 })
    const voter = b.voters[0] as Battle['voters'][0]
    for (let i = 0; i < 40; i++)
      await b.t.db.insert(xpEvent).values({
        id: `cap-${i}`,
        userId: voter.id,
        kind: 'vote',
        ref: `otra-${i}`,
        weekId: b.weekId,
        amount: 5,
        createdAt: 0,
      })
    const [a] = b.producers.map((p) => p.entryId) as [string]
    const l = listener(b.t, voter.cookie)
    await l.ready(a)
    const res = (await l.vote(a, 3)).json().data
    // Ni el voto (pasado el tope) ni nada más que el logro del primer voto.
    expect(res.game).toMatchObject({ xp: 25, achievements: ['first_vote'] })
    expect(await ledgerSum(voter.id)).toBe(200 + 25)
  })

  it('RF-GAME-05: jurado completo al votar la última de las activas ajenas (5 o más): 50 XP y jury_full, una vez', async () => {
    b = await battle({ producers: 5, voters: 1 })
    const voter = b.voters[0] as Battle['voters'][0]
    const l = listener(b.t, voter.cookie)
    const deltas = []
    for (const p of b.producers) {
      await l.ready(p.entryId)
      deltas.push((await l.vote(p.entryId, 3)).json().data.game)
    }
    expect(deltas.slice(1, 4).map((d) => d.xp)).toEqual([5, 5, 5])
    expect(deltas[4]).toEqual({ xp: 5 + 50 + 75, achievements: ['jury_full'], level: 2 })
    // Cambiar una nota con el jurado completo no lo paga otra vez.
    expect((await l.vote(b.producers[0]?.entryId as string, 5)).json().data.game.xp).toBe(0)
    const rows = await ledger(voter.id)
    expect(rows.filter((r) => r.kind === 'jury_complete')).toMatchObject([{ ref: b.weekId, amount: 50 }])
  })

  it('RF-GAME-05: con 4 entradas no hay jurado completo; un productor no cuenta la suya', async () => {
    b = await battle({ producers: 5, voters: 0 })
    const me = b.producers[0] as Battle['producers'][0]
    const l = listener(b.t, me.cookie)
    let last = null
    for (const p of b.producers.slice(1)) {
      await l.ready(p.entryId)
      last = (await l.vote(p.entryId, 4)).json().data.game
    }
    expect(last).toEqual({ xp: 5, achievements: [], level: 1 })
    expect((await ledger(me.id)).some((r) => r.kind === 'jury_complete')).toBe(false)
  })

  it('RF-GAME-05: votes_100 con el voto número 100 de la cuenta (uno por entrada, también los anulados)', async () => {
    b = await battle({ producers: 1, voters: 1 })
    const voter = b.voters[0] as Battle['voters'][0]
    for (let i = 0; i < 99; i++)
      await b.t.db.insert(vote).values({
        userId: voter.id,
        entryId: `antigua-${i}`,
        weekId: 'otra-semana',
        stars: 4,
        voided: i === 0,
        createdAt: 0,
        updatedAt: 0,
      })
    const [a] = b.producers.map((p) => p.entryId) as [string]
    const l = listener(b.t, voter.cookie)
    await l.ready(a)
    expect((await l.vote(a, 4)).json().data.game.achievements).toEqual(['first_vote', 'votes_100'])
  })

  it('RF-GAME-05: night_owl con 10 votos a entradas distintas entre las 03:00 y las 05:00 (hora de Madrid) de una noche', async () => {
    b = await battle({ producers: 2, voters: 1 })
    const voter = b.voters[0] as Battle['voters'][0]
    // Martes 13 de octubre, 03:30 en Madrid (CEST) = 01:30 UTC.
    const at = Date.UTC(2026, 9, 13, 1, 30)
    for (let i = 0; i < 9; i++)
      await b.t.db.insert(vote).values({
        userId: voter.id,
        entryId: `noche-${i}`,
        weekId: b.weekId,
        stars: 3,
        createdAt: at - 20 * 60_000 + i,
        updatedAt: at - 20 * 60_000 + i,
      })
    const [a, c] = b.producers.map((p) => p.entryId) as [string, string]
    const l = listener(b.t, voter.cookie)
    b.t.clock.set(at)
    await l.ready(a)
    expect((await l.vote(a, 4)).json().data.game.achievements).toEqual(['first_vote', 'night_owl'])
    // A las 05:00 ya no es la franja.
    b.t.clock.set(Date.UTC(2026, 9, 13, 3, 0))
    await l.ready(c)
    expect((await l.vote(c, 4)).json().data.game.achievements).toEqual([])
  })

  it('RF-GAME-05: level_20 al cruzar el nivel 20 con el XP de un voto', async () => {
    b = await battle({ producers: 1, voters: 1 })
    const voter = b.voters[0] as Battle['voters'][0]
    await b.t.db.insert(xpEvent).values({
      id: 'casi',
      userId: voter.id,
      kind: 'result',
      ref: 'w-vieja',
      weekId: 'w-vieja',
      amount: xpForLevel(LEVEL_MAX) - 10,
      createdAt: 0,
    })
    const [a] = b.producers.map((p) => p.entryId) as [string]
    const l = listener(b.t, voter.cookie)
    await l.ready(a)
    // 5 del voto + 25 de first_vote lo cruzan: level_20 (300) en el mismo batch.
    expect((await l.vote(a, 5)).json().data.game).toEqual({
      xp: 5 + 25 + 300,
      achievements: ['first_vote', 'level_20'],
      level: LEVEL_MAX,
    })
    expect(await cachedXp(voter.id)).toBe(xpForLevel(LEVEL_MAX) - 10 + 330)
  })

  it('§4.11: el XP de un voto que no queda guardado no se escribe (condición del hecho)', async () => {
    b = await battle({ producers: 1, voters: 1 })
    const voter = b.voters[0] as Battle['voters'][0]
    const [a] = b.producers.map((p) => p.entryId) as [string]
    let n = 0
    const game = createGameService({ db: b.t.db, newId: () => `g-${++n}` })
    const plan = await game.voteCast(voter.id, {
      entryId: a,
      weekId: b.weekId,
      golden: false,
      isNew: true,
      now: b.t.clock.now(),
    })
    expect(plan.delta).toMatchObject({ xp: 30, achievements: ['first_vote'] })
    await runBatch(b.t.db, plan.statements)
    expect(await ledger(voter.id)).toEqual([])
    expect(await unlocks(voter.id)).toEqual([])
    expect(await cachedXp(voter.id)).toBe(0)
  })
})

// ─── La descarga y el perfil ────────────────────────────────────────────────────────────────────────────────────

describe('la descarga del sample y el perfil (7.9, Anexo C)', () => {
  it('RF-GAME-05: first_drop al descargar el primer sample, una vez', async () => {
    await openWeek()
    const lil = await producer('lilbru')
    const download = () =>
      app().app.inject({
        method: 'POST',
        url: '/api/weeks/2026-w42/sample/download',
        headers: json(lil.cookie),
        payload: { kind: 'original' },
      })
    expect((await download()).statusCode).toBe(200)
    expect((await download()).statusCode).toBe(200)
    expect(await unlocks(lil.id)).toEqual(['first_drop'])
    expect((await ledger(lil.id)).map((r) => [r.kind, r.ref, r.amount])).toEqual([
      ['achievement', 'first_drop', 25],
    ])
    const [unlock] = await app()
      .db.select()
      .from(achievementUnlock)
      .where(eq(achievementUnlock.userId, lil.id))
    const [w] = await app().db.select({ id: week.id }).from(week).where(eq(week.slug, '2026-w42'))
    expect(unlock).toMatchObject({ weekId: w?.id })
  })

  it('RF-GAME-05: profile_done al guardar el perfil con avatar, bio y un enlace (y no antes)', async () => {
    await openWeek()
    const lil = await producer('lilbru')
    const put = (payload: object) =>
      app().app.inject({ method: 'PUT', url: '/api/me/profile', headers: json(lil.cookie), payload })
    expect((await put({ bio: 'Beats desde Gràcia' })).statusCode).toBe(200)
    expect((await put({ links: { instagram: 'instagram.com/lilbru' } })).statusCode).toBe(200)
    expect(await unlocks(lil.id)).toEqual([]) // sin avatar
    await app()
      .db.update(producerProfile)
      .set({ avatarPublicId: 'beatbattle-test/avatars/x/y' })
      .where(eq(producerProfile.userId, lil.id))
    expect((await put({ city: 'Barcelona' })).statusCode).toBe(200)
    expect(await unlocks(lil.id)).toEqual(['profile_done'])
    expect(await cachedXp(lil.id)).toBe(25)
  })
})

describe('la caché siempre es la suma del libro (7.9)', () => {
  it('RF-GAME-01: tras subir, votar y descargar, producer_profile.xp = Σ xp_event de cada cuenta', async () => {
    b = await battle({ producers: 5, voters: 2 })
    for (const voter of b.voters) {
      const l = listener(b.t, voter.cookie)
      for (const p of b.producers) {
        await l.ready(p.entryId)
        await l.vote(p.entryId, 1 + (p.entryId.length % 5))
      }
    }
    for (const account of [...b.voters, ...b.producers])
      expect(await cachedXp(account.id)).toBe(await ledgerSum(account.id))
    const rows = await b.t.db
      .select()
      .from(xpEvent)
      .where(and(eq(xpEvent.kind, 'jury_complete'), eq(xpEvent.weekId, b.weekId)))
    expect(rows).toHaveLength(2)
  })
})
