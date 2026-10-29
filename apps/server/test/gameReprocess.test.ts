import { scheduleWeek as boundaries, seasonEndsAt, XP_VOTE_MAX_VOTES_PER_WEEK } from '@beatbattle/rules'
import { and, eq, gte, lt, sql } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Db } from '../src/db/client'
import {
  achievementUnlock,
  entry,
  jobState,
  producerProfile,
  sampleDownload,
  streakState,
  vote,
  week,
  xpEvent,
} from '../src/db/schema'
import { reprocessGame } from '../src/modules/game/reprocess'
import { entryValues, listener } from './fixtures/battle'
import { type SimSeason, simSeason } from './fixtures/season'
import { sineWav } from './fixtures/wav'
import { createSample, json, makeWeeksApp, scheduleWeek, type WeeksApp } from './fixtures/weeks'
import { createAccount } from './helpers'

// Cada bloque juega varias semanas por la API (cuentas, subidas medidas con ffmpeg, escuchas y votos).
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

/**
 * El reprocesado de la capa de juego (guía §2.10, §4.11; tarea 7.16): reparte el XP y los logros de lo que ya pasó a
 * quien jugó antes de que existiera la capa de juego, idempotente (`RF-GAME-01`): dos pasadas dan el mismo libro, y
 * sobre una base en la que los ganchos en vivo ya escribieron no cambia nada.
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const CRON = 'cron-secret-de-prueba-0123456789abcdef'
let serial = 0
const newId = () => `rp-${String(++serial).padStart(6, '0')}`

const byJson = (a: unknown, b: unknown) => {
  const x = JSON.stringify(a)
  const y = JSON.stringify(b)
  return x < y ? -1 : x > y ? 1 : 0
}

/** Lo que la capa de juego guarda, sin ids ni lo ya visto, en un orden fijo. */
async function gameState(db: Db) {
  return {
    ledger: (await db.select().from(xpEvent)).map(({ id: _id, ...row }) => row).sort(byJson),
    unlocks: (await db.select().from(achievementUnlock)).map(({ seenAt: _seen, ...row }) => row).sort(byJson),
    // La última semana aplicada es contabilidad del sellado (una cuenta sin racha que no juega no se toca).
    streaks: (await db.select().from(streakState))
      .map(({ lastWeekNumber: _last, ...row }) => row)
      .sort(byJson),
    xp: (
      await db.select({ userId: producerProfile.userId, xp: producerProfile.xp }).from(producerProfile)
    ).sort(byJson),
  }
}

/** Sin capa de juego: el libro, los logros y las rachas fuera, y la caché a 0 (lo de antes de la Fase 7). */
async function wipeGame(db: Db, from = Number.NEGATIVE_INFINITY) {
  if (from === Number.NEGATIVE_INFINITY) {
    await db.delete(xpEvent)
    await db.delete(achievementUnlock)
    await db.delete(streakState)
  } else {
    // La capa de juego llegó en `from`: lo de antes no existe.
    await db.delete(xpEvent).where(lt(xpEvent.createdAt, from))
    await db.delete(achievementUnlock).where(lt(achievementUnlock.unlockedAt, from))
  }
  await db.delete(jobState).where(eq(jobState.name, 'gameReprocess'))
  await db.update(producerProfile).set({
    xp: sql`(SELECT coalesce(sum(amount), 0) FROM xp_event WHERE xp_event.user_id = producer_profile.user_id)`,
  })
}

const reprocess = (db: Db, now: number, apply = true) => reprocessGame({ db, now, newId, apply })

const NOTHING = { accounts: 0, movements: {}, achievements: {}, xp: 0, streaks: 0 }

// ─── Una historia jugada en vivo ────────────────────────────────────────────────────────────────────────────────

/** Las tres últimas semanas de la 2026-T3 (la 40 es la de su último lunes: su sellado cierra la temporada). */
const W38 = boundaries({ year: 2026, month: 9, day: 14 })
const W39 = boundaries({ year: 2026, month: 9, day: 21 })
const W40 = boundaries({ year: 2026, month: 9, day: 28 })
const WEEKS = [
  { slug: '2026-w38', monday: '2026-09-14', bounds: W38 },
  { slug: '2026-w39', monday: '2026-09-21', bounds: W39 },
  { slug: '2026-w40', monday: '2026-09-28', bounds: W40 },
] as const

/** Quién sube cada semana y su calidad (todos votan con esas estrellas: el jurado acierta). */
const PLAY: readonly (readonly [producer: number, stars: number][])[] = [
  [
    [0, 5],
    [1, 4],
    [2, 3],
    [3, 2],
    [4, 1],
    [5, 3],
    [6, 2],
    [7, 4],
  ],
  // La 39, dorada; el 1 marca el reto.
  [
    [0, 5],
    [1, 4],
    [2, 3],
    [3, 2],
    [4, 1],
  ],
  // La 40, sin el 1 (gasta el comodín).
  [
    [0, 5],
    [2, 4],
    [3, 3],
    [4, 2],
    [5, 1],
  ],
]

interface LiveHistory {
  t: WeeksApp
  producers: { id: string; cookie: string }[]
  jury: { id: string; cookie: string }
  /** El instante del primer voto de la 39: la mitad de la historia. */
  middle: number
}

async function liveHistory(): Promise<LiveHistory> {
  const t = await makeWeeksApp({ cronSecret: CRON })
  t.clock.set(W38.startsAt - DAY)
  const { id: sampleId } = await createSample(t)
  for (const w of WEEKS) {
    const res = await scheduleWeek(t, w.monday, sampleId)
    if (res.statusCode !== 201) throw new Error(`semana ${w.slug}: ${res.body}`)
  }
  await t.db.update(week).set({ golden: true }).where(eq(week.slug, '2026-w39'))
  const producers: { id: string; cookie: string }[] = []
  for (let p = 0; p < 8; p++)
    producers.push(
      await createAccount(t, {
        email: `prod${p}@example.com`,
        username: `prod${p}`,
        ip: `203.0.113.${p + 1}`,
      }),
    )
  const jury = await createAccount(t, { email: 'oido@example.com', username: 'oidofino', ip: '203.0.113.50' })
  let middle = 0
  for (const [i, w] of WEEKS.entries()) {
    t.clock.set(w.bounds.startsAt + HOUR)
    const play = PLAY[i] as readonly (readonly [number, number])[]
    const entries: { owner: number; id: string; stars: number }[] = []
    for (const [p, stars] of play) {
      const who = producers[p] as { id: string; cookie: string }
      const rules = await t.app.inject({
        method: 'POST',
        url: `/api/weeks/${w.slug}/rules`,
        headers: json(who.cookie),
        payload: { rulesVersion: 1 },
      })
      if (rules.statusCode >= 300) throw new Error(`bases: ${rules.body}`)
      if (i === 0 && p < 2)
        await t.app.inject({
          method: 'POST',
          url: `/api/weeks/${w.slug}/sample/download`,
          headers: json(who.cookie),
          payload: { kind: 'original' },
        })
      const bytes = sineWav({ seconds: 31 + p, sampleRate: 8000, channels: 1 })
      const signed = await t.app.inject({
        method: 'POST',
        url: '/api/uploads/sign',
        headers: json(who.cookie),
        payload: {
          kind: 'entry',
          weekSlug: w.slug,
          mime: 'audio/wav',
          bytes: bytes.byteLength,
          durationMs: 31_000,
        },
      })
      if (signed.statusCode !== 200) throw new Error(`firma: ${signed.body}`)
      const { intentId, publicId } = signed.json().data
      await t.storage.put({ publicId, bytes, format: 'wav', nowMs: t.clock.now() })
      const res = await t.app.inject({
        method: 'POST',
        url: `/api/weeks/${w.slug}/entries`,
        headers: json(who.cookie),
        payload: {
          intentId,
          title: `Flip ${p}`,
          bpm: 140,
          musicalKey: 'Am',
          daw: 'FL Studio',
          genres: ['Trap'],
          description: null,
          declaration: true,
          ...(i === 1 && p === 1 ? { challengeClaimed: true } : {}),
        },
      })
      if (res.statusCode !== 201) throw new Error(`entrada: ${res.body}`)
      const created = res.json().data
      if (created.status !== 'active') throw new Error('la entrada no quedó activa')
      entries.push({ owner: p, id: created.id, stars })
      t.clock.advance(MINUTE)
    }
    if (i === 1) middle = t.clock.now()
    // El jurado vota todas; cada productor, las tres siguientes.
    const voters = [
      { cookie: jury.cookie, targets: entries },
      ...entries.map((e, k) => ({
        cookie: (producers[e.owner] as { cookie: string }).cookie,
        targets: [1, 2, 3].map((d) => entries[(k + d) % entries.length] as (typeof entries)[number]),
      })),
    ]
    for (const voter of voters) {
      const ear = listener(t, voter.cookie)
      for (const target of voter.targets) {
        await ear.ready(target.id)
        const voted = await ear.vote(target.id, target.stars)
        if (voted.statusCode !== 200) throw new Error(`voto: ${voted.body}`)
      }
    }
  }
  // El tick sella la 40 (las anteriores las selló la subida de la siguiente) y con ella cierra la 2026-T3.
  t.clock.set(W40.voteEndsAt + MINUTE)
  const tick = await t.app.inject({
    method: 'GET',
    url: '/api/cron/tick',
    headers: { authorization: `Bearer ${CRON}` },
  })
  if (tick.statusCode !== 200) throw new Error(`tick: ${tick.body}`)
  return { t, producers, jury, middle }
}

describe('el reprocesado sobre una historia jugada en vivo (7.16)', () => {
  let h: LiveHistory
  let live: Awaited<ReturnType<typeof gameState>>
  const now = () => W40.voteEndsAt + DAY

  beforeAll(async () => {
    h = await liveHistory()
    live = await gameState(h.t.db)
  })
  afterAll(async () => {
    await h?.t.app.close()
  })

  it('la historia trae de todo: campeón de temporada, oído de oro, comodín gastado, reto, dorada y jurado completo', async () => {
    const has = (userId: string, id: string) =>
      live.unlocks.some((u) => u.userId === userId && u.achievementId === id)
    const [p0, p1] = h.producers as unknown as [{ id: string }, { id: string }]
    for (const id of ['season_champ', 'win_3', 'double', 'streak_3', 'early_bird', 'first_drop'])
      expect(has(p0.id, id), id).toBe(true)
    expect(has(p1.id, 'challenge')).toBe(true)
    expect(has(p1.id, 'golden_week')).toBe(true)
    expect(has(h.jury.id, 'golden_ear')).toBe(true)
    expect(has(h.jury.id, 'jury_full')).toBe(true)
    expect(live.streaks.find((s) => s.userId === p1.id)).toMatchObject({ current: 2, jokerSeason: '2026-T3' })
    expect(live.ledger.filter((r) => r.kind === 'jury_complete' && r.userId === h.jury.id)).toHaveLength(3)
  })

  it('RF-GAME-01: sobre una base en la que los ganchos en vivo ya escribieron, reprocesar no cambia nada', async () => {
    const dry = await reprocess(h.t.db, now(), false)
    expect(dry).toMatchObject({ ...NOTHING, applied: false })
    const summary = await reprocess(h.t.db, now())
    expect(summary).toMatchObject({ ...NOTHING, applied: true, sealed: [] })
    // El corte es el primer movimiento del libro: lo que escribieron los ganchos en vivo, que es todo.
    expect(summary?.cutoff).toBe(Math.min(...live.ledger.map((r) => r.createdAt)))
    expect(await gameState(h.t.db)).toEqual(live)
  })

  it('RF-GAME-01: sin capa de juego, el reprocesado escribe el mismo libro que los ganchos en vivo, con el instante de cada hecho y los logros ya vistos', async () => {
    await wipeGame(h.t.db)
    // Sin `apply`, solo cuenta: no escribe nada.
    const dry = await reprocess(h.t.db, now(), false)
    expect(dry?.xp).toBe(live.ledger.reduce((sum, r) => sum + r.amount, 0))
    expect((await gameState(h.t.db)).ledger).toEqual([])
    const summary = await reprocess(h.t.db, now())
    expect(summary).toMatchObject({ applied: true, cutoff: now(), xp: dry?.xp })
    expect(summary?.movements).toEqual(dry?.movements)
    expect(await gameState(h.t.db)).toEqual(live)
    // Lo pasado no se anuncia: cada logro, visto en el instante de su hecho; y nada lleva el instante de ahora.
    for (const row of await h.t.db.select().from(achievementUnlock)) expect(row.seenAt).toBe(row.unlockedAt)
    for (const row of await h.t.db.select().from(xpEvent)) expect(row.createdAt).toBeLessThan(now())
  })

  it('RF-GAME-01: reprocesar dos veces da el mismo libro', async () => {
    const before = await h.t.db.select().from(xpEvent).orderBy(xpEvent.id)
    expect(await reprocess(h.t.db, now() + DAY)).toMatchObject(NOTHING)
    expect(await h.t.db.select().from(xpEvent).orderBy(xpEvent.id)).toEqual(before)
    expect(await gameState(h.t.db)).toEqual(live)
  })

  it('RF-GAME-01: con la capa de juego llegada a mitad de la historia, solo añade lo de antes del corte y el libro queda como en vivo', async () => {
    await wipeGame(h.t.db)
    expect(await reprocess(h.t.db, now())).toMatchObject({ applied: true })
    await wipeGame(h.t.db, h.middle)
    const kept = await h.t.db.select({ n: sql<number>`count(*)` }).from(xpEvent)
    expect(Number(kept[0]?.n)).toBeGreaterThan(0)
    const summary = await reprocess(h.t.db, now())
    expect(summary?.cutoff).toBeGreaterThanOrEqual(h.middle)
    expect(summary?.xp).toBeGreaterThan(0)
    expect(await gameState(h.t.db)).toEqual(live)
    // El corte queda guardado: la pasada siguiente usa el mismo y no añade nada.
    expect(await reprocess(h.t.db, now() + 2 * DAY)).toMatchObject({ ...NOTHING, cutoff: summary?.cutoff })
  })
})

// ─── Historias sin capa de juego (filas escritas a mano, como antes de la Fase 7) ─────────────────────────────

describe('el reprocesado de lo que pasó antes de la capa de juego (7.16)', () => {
  let s: SimSeason | undefined
  let t: WeeksApp | undefined
  afterEach(async () => {
    await s?.t.app.close()
    await t?.app.close()
    s = undefined
    t = undefined
  })

  it('RF-GAME-04: la racha en juego paga subir y el resultado; el comodín se gasta; el campeón de una temporada que cerró el tick, con el instante del cierre', async () => {
    // Dos semanas de la 2026-T3 (sin semana el último lunes: la cierra el tick) y una de la T4.
    s = await simSeason({
      first: { year: 2026, month: 9, day: 14 },
      count: 2,
      producers: 2,
      stars: (_w, p) => (p === 0 ? [5, 5, 5] : [3, 3, 3]),
    })
    const [first, second] = s.weeks as [(typeof s.weeks)[number], (typeof s.weeks)[number]]
    await s.tick(second.voteEndsAt + MINUTE)
    // Pasa el trimestre: el tick cierra la T3 con su campeón.
    expect((await s.tick(seasonEndsAt('2026-T3') + HOUR)).closedSeasons).toEqual(['2026-T3'])
    const [p0, p1] = s.producers as unknown as [{ id: string }, { id: string }]
    await wipeGame(s.t.db)
    // El tick ya había apuntado la temporada como cerrada: no vuelve a dar nada.
    expect((await s.tick(seasonEndsAt('2026-T3') + 2 * HOUR)).closedSeasons).toEqual([])
    const now = seasonEndsAt('2026-T3') + 10 * DAY
    const summary = await reprocess(s.t.db, now)
    expect(summary?.achievements).toMatchObject({
      first_entry: 2,
      early_bird: 1,
      podium: 2,
      win: 1,
      season_champ: 1,
    })
    const rows = (userId: string) =>
      s?.t.db
        .select({ kind: xpEvent.kind, ref: xpEvent.ref, amount: xpEvent.amount, at: xpEvent.createdAt })
        .from(xpEvent)
        .where(eq(xpEvent.userId, userId))
        .orderBy(xpEvent.createdAt, xpEvent.kind, xpEvent.ref)
    const mine = (await rows(p0.id)) ?? []
    // Subir la 1 (racha en juego 1) y la 2 (racha en juego 2: +10 %); 1.º las dos veces (500 y 550).
    // Las dos se sellaron en el mismo tick, después de subir la 2 (que paga con la racha que deja la 1 sellada).
    expect(mine.filter((r) => r.kind !== 'achievement').map((r) => [r.kind, r.ref, r.amount])).toEqual([
      ['entry', first.id, 100],
      ['first_entry_of_week', first.id, 25],
      ['entry', second.id, 110],
      ['first_entry_of_week', second.id, 25],
      ['result', first.id, 500],
      ['result', second.id, 550],
    ])
    const [sealedFirst] = await s.t.db.select({ at: week.sealedAt }).from(week).where(eq(week.id, first.id))
    expect(mine.find((r) => r.kind === 'result' && r.ref === first.id)?.at).toBe(sealedFirst?.at)
    const [champ] = await s.t.db
      .select()
      .from(achievementUnlock)
      .where(and(eq(achievementUnlock.userId, p0.id), eq(achievementUnlock.achievementId, 'season_champ')))
    expect(champ).toMatchObject({ ref: '2026-T3', weekId: second.id, unlockedAt: seasonEndsAt('2026-T3') })
    expect(champ?.seenAt).toBe(champ?.unlockedAt)
    // La caché, la suma del libro; y el 1, segundo las dos veces (350 y 385).
    const [cache] = await s.t.db.select().from(producerProfile).where(eq(producerProfile.userId, p0.id))
    expect(cache?.xp).toBe(mine.reduce((sum, r) => sum + r.amount, 0))
    expect(((await rows(p1.id)) ?? []).filter((r) => r.kind === 'result').map((r) => r.amount)).toEqual([
      350, 385,
    ])
    expect(await s.t.db.select().from(streakState).where(eq(streakState.userId, p0.id))).toEqual([
      { userId: p0.id, current: 2, best: 2, lastWeekNumber: 2, jokerSeason: null },
    ])
    expect(await reprocess(s.t.db, now + DAY)).toMatchObject(NOTHING)
  })

  it('RF-GAME-03: una semana partida por el corte no pasa del tope de 40 votos con XP', async () => {
    t = await makeWeeksApp({ cronSecret: CRON })
    const W42 = boundaries({ year: 2026, month: 10, day: 12 })
    t.clock.set(W42.startsAt - DAY)
    const { id: sampleId } = await createSample(t)
    await scheduleWeek(t, '2026-10-12', sampleId)
    const [w] = await t.db.select({ id: week.id }).from(week)
    const weekId = w?.id as string
    const owner = await createAccount(t, { email: 'duena@example.com', username: 'duena', ip: '203.0.113.9' })
    const ids: string[] = []
    for (let i = 0; i < 45; i++) {
      const values = entryValues(weekId, owner.id, {
        submittedAt: W42.startsAt + i,
        alias: `A${i}`,
        receiptNumber: i + 1,
      })
      // Cada entrada de una cuenta distinta (una por semana y cuenta); la dueña de todas, a efectos del voto, da igual.
      values.userId = `otra-${i}`
      await t.db.insert(entry).values(values)
      ids.push(values.id)
    }
    const jury = await createAccount(t, {
      email: 'oido@example.com',
      username: 'oidofino',
      ip: '203.0.113.10',
    })
    // 30 votos antes de la capa de juego (sin libro)…
    for (const [i, entryId] of ids.slice(0, 30).entries())
      await t.db.insert(vote).values({
        userId: jury.id,
        entryId,
        weekId,
        stars: 3,
        createdAt: W42.startsAt + HOUR + i,
        updatedAt: W42.startsAt + HOUR + i,
      })
    // …y 15 después, en vivo: los ganchos no ven los de antes y dan XP a los 15.
    t.clock.set(W42.startsAt + 2 * HOUR)
    const ear = listener(t, jury.cookie)
    for (const entryId of ids.slice(30)) {
      await ear.ready(entryId)
      expect((await ear.vote(entryId, 4)).statusCode).toBe(200)
    }
    const paid = () =>
      t?.db
        .select({ amount: xpEvent.amount })
        .from(xpEvent)
        .where(and(eq(xpEvent.userId, jury.id), eq(xpEvent.kind, 'vote')))
    expect((await paid())?.length).toBe(15)
    const summary = await reprocess(t.db, W42.startsAt + 3 * HOUR)
    // Los 30 de antes caben hasta llenar el tope: 25.
    expect(summary?.movements.vote).toBe(XP_VOTE_MAX_VOTES_PER_WEEK - 15)
    const after = (await paid()) ?? []
    expect(after).toHaveLength(XP_VOTE_MAX_VOTES_PER_WEEK)
    expect(after.reduce((sum, r) => sum + r.amount, 0)).toBe(200)
    // Y el corte deja fuera lo de después: los votos en vivo no se vuelven a contar.
    expect(summary?.cutoff).toBeGreaterThan(W42.startsAt + HOUR + 29)
    expect(summary?.cutoff).toBeLessThanOrEqual(W42.startsAt + 2 * HOUR + 31_000)
  })

  it('RF-GAME-05: una descarga y un perfil completo cuentan con su instante; lo de una cuenta borrada no vuelve', async () => {
    s = await simSeason({
      first: { year: 2026, month: 10, day: 5 },
      count: 1,
      producers: 2,
      stars: () => [4, 4, 4],
    })
    const [only] = s.weeks as [(typeof s.weeks)[number]]
    const [p0, p1] = s.producers as unknown as [{ id: string }, { id: string }]
    // La entrada del 1, de una cuenta borrada tras la semana sellada (`deleted:<entrada>`).
    await s.t.db
      .update(entry)
      .set({ userId: `deleted:${s.entries.get(only.id)?.get(p1.id)}` })
      .where(eq(entry.userId, p1.id))
    await s.t.db.insert(sampleDownload).values({
      userId: p0.id,
      weekId: only.id,
      kind: 'original',
      count: 2,
      firstAt: only.startsAt + MINUTE,
      lastAt: only.startsAt + HOUR,
    })
    await s.t.db
      .update(producerProfile)
      .set({
        avatarPublicId: 'beatbattle-test/avatars/p0',
        bio: 'Beats de madrugada',
        links: '{"instagram":"https://instagram.com/p0"}',
      })
      .where(eq(producerProfile.userId, p0.id))
    await s.tick(only.voteEndsAt + MINUTE)
    await wipeGame(s.t.db)
    const summary = await reprocess(s.t.db, only.voteEndsAt + DAY)
    expect(summary?.achievements).toMatchObject({ first_drop: 1, profile_done: 1 })
    const [drop] = await s.t.db
      .select()
      .from(achievementUnlock)
      .where(and(eq(achievementUnlock.userId, p0.id), eq(achievementUnlock.achievementId, 'first_drop')))
    expect(drop).toMatchObject({ ref: only.id, weekId: only.id, unlockedAt: only.startsAt + MINUTE })
    // El 1 sigue teniendo cuenta, pero su entrada ya no es suya: no gana nada de ella.
    expect(
      await s.t.db
        .select()
        .from(xpEvent)
        .where(and(eq(xpEvent.userId, p1.id), gte(xpEvent.amount, 1))),
    ).toEqual([])
    expect(await s.t.db.select().from(xpEvent).where(sql`${xpEvent.userId} LIKE 'deleted:%'`)).toEqual([])
  })
})

// ─── El paso opcional del tick ──────────────────────────────────────────────────────────────────────────────────

describe('el paso opcional del tick (7.16, §4.12)', () => {
  let s: SimSeason | undefined
  afterEach(async () => {
    await s?.t.app.close()
    s = undefined
  })

  const tickWith = async (sim: SimSeason, at: number) => {
    sim.t.clock.set(at)
    const res = await sim.t.app.inject({
      method: 'GET',
      url: '/api/cron/tick',
      headers: { authorization: `Bearer ${CRON}` },
    })
    expect(res.statusCode, res.body).toBe(200)
    return res.json().data
  }

  it('RF-GAME-01: apagado por defecto, el tick no reprocesa', async () => {
    s = await simSeason({ count: 2, producers: 2, stars: (_w, p) => [p + 3, p + 3, p + 3] })
    const last = s.weeks.at(-1) as (typeof s.weeks)[number]
    await s.tick(last.voteEndsAt + MINUTE)
    await wipeGame(s.t.db)
    expect((await tickWith(s, last.voteEndsAt + HOUR)).gameReprocess).toBeNull()
    expect(await s.t.db.select().from(xpEvent)).toEqual([])
  })

  it('RF-GAME-01: con BB_GAME_REPROCESS, el tick reprocesa una vez, antes de sellar, y los siguientes no hacen nada', async () => {
    // Dos semanas jugadas sin capa de juego (filas a mano) y sin sellar.
    s = await simSeason({
      count: 2,
      producers: 2,
      stars: (_w, p) => [p + 3, p + 3, p + 3],
      config: { gameReprocess: true },
    })
    const last = s.weeks.at(-1) as (typeof s.weeks)[number]
    const at = last.voteEndsAt + HOUR
    const first = await tickWith(s, at)
    // El reprocesado sella antes lo que ya cerró (en vivo, ahora) y reparte lo de antes: subir las dos semanas.
    expect(first.gameReprocess).toMatchObject({
      applied: true,
      cutoff: at,
      sealed: s.weeks.map((w) => w.slug),
    })
    expect(first.gameReprocess.movements).toMatchObject({ entry: 4, first_entry_of_week: 2 })
    expect(first.sealed).toEqual([])
    const entries = await s.t.db.select().from(xpEvent).where(eq(xpEvent.kind, 'entry'))
    for (const row of entries) expect(row.createdAt).toBeLessThan(s.weeks.at(-1)?.voteEndsAt as number)
    const ledger = await s.t.db.select().from(xpEvent).orderBy(xpEvent.id)
    const again = await tickWith(s, at + 15 * MINUTE)
    expect(again.gameReprocess).toBeNull()
    expect(await s.t.db.select().from(xpEvent).orderBy(xpEvent.id)).toEqual(ledger)
  })
})
