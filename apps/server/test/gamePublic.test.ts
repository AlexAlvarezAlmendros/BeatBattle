import { levelOf } from '@beatbattle/rules'
import { MeSchema, PublicProfileSchema } from '@beatbattle/shared'
import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { achievementUnlock, producerProfile, xpEvent } from '../src/db/schema'
import { HOUR, listener, W42 } from './fixtures/battle'
import { CRON, type SimSeason, simSeason } from './fixtures/season'
import { producerFor, submitEntry } from './fixtures/upload'
import { createSample, json, makeWeeksApp, scheduleWeek, type WeeksApp } from './fixtures/weeks'
import { createAccount, makeApp, ORIGIN, type TestApp } from './helpers'

// Cada prueba crea varias cuentas, sube audio y sella: en la CI pasa de los 5 s.
vi.setConfig({ testTimeout: 60_000 })

/**
 * La capa de juego en `me` y en el perfil (guía §1.3, §2.3, §2.10, §2.15, §4.10; tarea 7.13, huecos G1 y G13): lo
 * público solo cuenta semanas selladas; `me` es del dueño y va en vivo; lo ya visto (`level`, `achievement`,
 * `season_champion`) sale una vez.
 */

let t: TestApp | WeeksApp | undefined
let s: SimSeason | undefined
afterEach(async () => {
  await t?.app.close()
  await s?.t.app.close()
  t = undefined
  s = undefined
})

const get = (app: TestApp, url: string, cookie?: string) =>
  app.app.inject({ method: 'GET', url, ...(cookie ? { headers: { cookie } } : {}) })
const me = async (app: TestApp, cookie: string) =>
  MeSchema.parse((await get(app, '/api/me', cookie)).json().data)
const seen = (app: TestApp, cookie: string, payload: object) =>
  app.app.inject({ method: 'POST', url: '/api/me/seen', headers: json(cookie), payload })
const putProfile = (app: TestApp, cookie: string, payload: object) =>
  app.app.inject({ method: 'PUT', url: '/api/me/profile', headers: json(cookie), payload })

describe('contrato de voto ciego de la capa de juego (7.13, hueco G1)', () => {
  it('RNF-SEC-04, RF-PLAY-05: subir, votar y descargar en una semana ciega no cambian nada público hasta el sellado; `me` sí, en vivo', async () => {
    const app = await makeWeeksApp({ cronSecret: CRON })
    t = app
    const { id: sampleId } = await createSample(app)
    await scheduleWeek(app, '2026-10-12', sampleId)
    app.clock.set(W42.startsAt + HOUR)
    const lil = await producerFor(app, 'lilbru')
    const aina = await producerFor(app, 'aina')
    const voter = await producerFor(app, 'oyente')

    // Lo público, antes de nada: los perfiles, la temporada, el salón, la página compartible y el sitemap, sin sesión y
    // con la de otras cuentas.
    const urls = [
      '/api/profiles/lilbru',
      '/api/profiles/aina',
      '/api/profiles/oyente',
      '/api/seasons/2026-T4/standings',
      '/api/hall-of-fame',
      '/p/lilbru',
      '/p/oyente',
      '/sitemap.xml',
    ]
    const snapshot = async () => {
      const out: string[] = []
      for (const cookie of [undefined, voter.cookie, aina.cookie])
        for (const url of urls) {
          const res = await get(app, url, cookie)
          expect(res.statusCode, url).toBe(200)
          out.push(`${url}\n${res.body}`)
        }
      return out
    }
    const before = await snapshot()

    // Los hechos en vivo: las dos entradas pasan a `active` (XP de subir, primera de la semana, first_entry,
    // early_bird), el jurado descarga el sample (first_drop) y vota las dos (first_vote), y lilbru vota la de aina.
    const mine = await submitEntry(app, lil.cookie)
    expect(mine.status).toBe('active')
    expect(mine.game.achievements).toEqual(['first_entry', 'early_bird'])
    const hers = await submitEntry(app, aina.cookie)
    const download = await app.app.inject({
      method: 'POST',
      url: '/api/weeks/2026-w42/sample/download',
      headers: json(voter.cookie),
      payload: { kind: 'original' },
    })
    expect(download.statusCode).toBe(200)
    for (const [cookie, entryId] of [
      [voter.cookie, mine.id],
      [voter.cookie, hers.id],
      [lil.cookie, hers.id],
    ] as const) {
      const ear = listener(app, cookie)
      await ear.ready(entryId)
      expect((await ear.vote(entryId, 4)).statusCode).toBe(200)
    }

    // Nada público ha cambiado, byte a byte.
    expect(await snapshot()).toEqual(before)
    // Su dueño sí lo ve, en vivo: 100 + 25 + 25 + 75 de subir y 5 del voto (+25 de first_vote).
    const live = await me(app, lil.cookie)
    expect(live.game.xp).toBe(255)
    expect(live.xp).toBe(255)
    expect(live.game.unseenAchievements).toEqual(['first_entry', 'first_vote', 'early_bird'])
    expect((await me(app, voter.cookie)).game.unseenAchievements).toEqual(['first_drop', 'first_vote'])

    // Sellada la semana, lo público lo cuenta: el XP y los logros de esa semana, y su fila del historial.
    app.clock.set(W42.voteEndsAt)
    const tick = await app.app.inject({
      method: 'GET',
      url: '/api/cron/tick',
      headers: { authorization: `Bearer ${CRON}` },
    })
    expect(tick.json().data.sealed).toEqual(['2026-w42'])
    const after = PublicProfileSchema.parse((await get(app, '/api/profiles/lilbru')).json().data)
    expect(after.xp).toBe(255)
    expect(after.game.level).toBe(levelOf(255))
    expect(after.game.achievements.map((a) => a.id)).toEqual(['first_entry', 'first_vote', 'early_bird'])
    expect(after.game.history.map((row) => [row.weekSlug, row.entryId])).toEqual([['2026-w42', mine.id]])
    expect(after.game.stats.votesCast).toBe(1)
  })

  it('G1: un logro sin semana (profile_done) es público al momento; la vitrina pública solo enseña logros públicos', async () => {
    const app = await makeWeeksApp({ cronSecret: CRON })
    t = app
    const { id: sampleId } = await createSample(app)
    await scheduleWeek(app, '2026-10-12', sampleId)
    app.clock.set(W42.startsAt + HOUR)
    const lil = await producerFor(app, 'lilbru')
    await submitEntry(app, lil.cookie)
    // El perfil completo (sin semana) con XP: se ve ya.
    await app.db
      .update(producerProfile)
      .set({ avatarPublicId: 'bbt/avatars/x/a' })
      .where(eq(producerProfile.userId, lil.id))
    expect(
      (
        await putProfile(app, lil.cookie, {
          bio: 'Flips de soul.',
          links: { instagram: 'instagram.com/lilbru' },
        })
      ).statusCode,
    ).toBe(200)
    // La vitrina admite lo conseguido, también lo de la semana en juego; el dueño la ve entera.
    const chosen = await putProfile(app, lil.cookie, { showcase: ['early_bird', 'profile_done'] })
    expect(chosen.statusCode, chosen.body).toBe(200)
    expect(chosen.json().data.showcase).toEqual(['early_bird', 'profile_done'])
    const pub = PublicProfileSchema.parse((await get(app, '/api/profiles/lilbru')).json().data)
    expect(pub.game.achievements.map((a) => a.id)).toEqual(['profile_done'])
    expect(pub.game.showcase).toEqual(['profile_done'])
    expect(pub.xp).toBe(25)
    // Sellada, early_bird ya es público y sale en la vitrina, en el orden elegido.
    app.clock.set(W42.voteEndsAt)
    await get(app, '/api/weeks/current')
    const sealed = PublicProfileSchema.parse((await get(app, '/api/profiles/lilbru')).json().data)
    expect(sealed.game.showcase).toEqual(['early_bird', 'profile_done'])
  })
})

describe('la vitrina en Ajustes → Perfil (7.13)', () => {
  it('RF-PRF-01: hasta 3 logros conseguidos y distintos; otro → 422', async () => {
    const app = await makeApp()
    t = app
    const { id, cookie } = await createAccount(app, { email: 'aina@example.com', username: 'aina' })
    for (const achievement of ['first_vote', 'first_drop', 'podium', 'win'])
      await app.db
        .insert(achievementUnlock)
        .values({ userId: id, achievementId: achievement, ref: null, weekId: null, unlockedAt: 1 })
    expect((await putProfile(app, cookie, { showcase: ['win', 'podium', 'first_vote'] })).statusCode).toBe(
      200,
    )
    expect((await get(app, '/api/me/profile', cookie)).json().data.showcase).toEqual([
      'win',
      'podium',
      'first_vote',
    ])
    for (const showcase of [
      ['win', 'podium', 'first_vote', 'first_drop'],
      ['win', 'win'],
      ['oracle'],
      ['nope'],
    ]) {
      const res = await putProfile(app, cookie, { showcase })
      expect(res.statusCode, JSON.stringify(showcase)).toBe(422)
    }
    expect((await putProfile(app, cookie, { showcase: [] })).json().data.showcase).toEqual([])
  })
})

describe('GET /api/me y POST /api/me/seen (7.13)', () => {
  it('RF-GAME-09: el nivel visto sube una vez hasta el de la cuenta, nunca más allá ni hacia abajo', async () => {
    const app = await makeApp()
    t = app
    const { id, cookie } = await createAccount(app, { email: 'aina@example.com', username: 'aina' })
    const fresh = await me(app, cookie)
    expect(fresh.game).toEqual({
      xp: 0,
      level: 1,
      levelSeen: 1,
      streak: { current: 0, best: 0, jokerAvailable: true },
      season: { id: '2026-T4', points: 0, position: null },
      unseenAchievements: [],
      seasonCeremony: null,
    })
    await app.db.insert(xpEvent).values({
      id: 'x1',
      userId: id,
      kind: 'achievement',
      ref: 'win',
      weekId: null,
      amount: 2000,
      createdAt: 1,
    })
    await app.db.update(producerProfile).set({ xp: 2000 }).where(eq(producerProfile.userId, id))
    const level = levelOf(2000)
    expect((await me(app, cookie)).game).toMatchObject({ xp: 2000, level, levelSeen: 1 })
    expect((await seen(app, cookie, { kind: 'level', ref: level })).statusCode).toBe(204)
    expect((await me(app, cookie)).game.levelSeen).toBe(level)
    // Ni más allá del suyo, ni hacia abajo; repetirlo no cambia nada.
    await seen(app, cookie, { kind: 'level', ref: 20 })
    await seen(app, cookie, { kind: 'level', ref: 1 })
    await seen(app, cookie, { kind: 'level', ref: level })
    expect((await me(app, cookie)).game.levelSeen).toBe(level)
    expect((await seen(app, cookie, { kind: 'level', ref: 21 })).statusCode).toBe(422)
    expect((await seen(app, cookie, { kind: 'level', ref: '3' })).statusCode).toBe(422)
  })

  it('§3.8.8: el aviso de un logro se marca visto una vez; uno que no tiene, 404; sin sesión, 401', async () => {
    const app = await makeApp()
    t = app
    const { id, cookie } = await createAccount(app, { email: 'aina@example.com', username: 'aina' })
    for (const achievement of ['first_vote', 'first_drop'])
      await app.db
        .insert(achievementUnlock)
        .values({ userId: id, achievementId: achievement, ref: null, weekId: null, unlockedAt: 1 })
    expect((await me(app, cookie)).game.unseenAchievements).toEqual(['first_drop', 'first_vote'])
    expect((await seen(app, cookie, { kind: 'achievement', ref: 'first_vote' })).statusCode).toBe(204)
    expect((await seen(app, cookie, { kind: 'achievement', ref: 'first_vote' })).statusCode).toBe(204)
    expect((await me(app, cookie)).game.unseenAchievements).toEqual(['first_drop'])
    expect((await seen(app, cookie, { kind: 'achievement', ref: 'win' })).statusCode).toBe(404)
    expect((await seen(app, cookie, { kind: 'achievement', ref: 'nope' })).statusCode).toBe(422)
    const anonymous = await app.app.inject({
      method: 'POST',
      url: '/api/me/seen',
      headers: { origin: ORIGIN, 'content-type': 'application/json' },
      payload: { kind: 'achievement', ref: 'first_drop' },
    })
    expect(anonymous.statusCode).toBe(401)
  })

  it('RF-ARC-05: la ceremonia de la temporada cerrada queda pendiente para cada cuenta hasta marcarla vista; con la racha y la temporada en `me`', async () => {
    s = await simSeason({
      first: { year: 2026, month: 12, day: 14 },
      count: 2,
      producers: 2,
      stars: (_, p) => (p === 0 ? [5, 5, 5] : [4, 4, 4]),
    })
    const [a, b] = s.producers as [SimSeason['producers'][0], SimSeason['producers'][0]]
    for (const w of s.weeks) await s.tick(w.voteEndsAt)
    // Antes de que acabe el trimestre: ni cerrada ni ceremonia.
    expect((await me(s.t, a.cookie)).game.seasonCeremony).toBeNull()
    expect((await seen(s.t, a.cookie, { kind: 'season_champion', ref: '2026-T4' })).statusCode).toBe(404)
    expect((await me(s.t, a.cookie)).game).toMatchObject({
      streak: { current: 2, best: 2, jokerAvailable: true },
      season: { id: '2026-T4', points: 50, position: 1 },
    })

    await s.tick(Date.UTC(2026, 11, 31, 23)) // las 00:00 del 1 de enero en Madrid
    expect((await me(s.t, a.cookie)).game.seasonCeremony).toEqual({ seasonId: '2026-T4', champion: true })
    expect((await me(s.t, b.cookie)).game.seasonCeremony).toEqual({ seasonId: '2026-T4', champion: false })
    // El 1 de enero (viernes) aún es la semana del 28 de diciembre: la temporada del HUD sigue siendo la 2026-T4.
    expect((await me(s.t, a.cookie)).game.season).toEqual({ id: '2026-T4', points: 50, position: 1 })
    expect((await seen(s.t, a.cookie, { kind: 'season_champion', ref: '2026-T4' })).statusCode).toBe(204)
    expect((await me(s.t, a.cookie)).game.seasonCeremony).toBeNull()
    expect((await me(s.t, b.cookie)).game.seasonCeremony).not.toBeNull()
    // Otro tick (ya el lunes 4, en la 2027-T1) no la vuelve a ofrecer.
    await s.tick(Date.UTC(2027, 0, 4, 12))
    expect((await me(s.t, a.cookie)).game.seasonCeremony).toBeNull()
    expect((await me(s.t, a.cookie)).game.season).toEqual({ id: '2027-T1', points: 0, position: null })
  })
})

describe('el perfil público con su capa de juego (7.13, §2.3, §3.8.10)', () => {
  it('RF-PRF-01, RNF-PRIV-04: teselas, historial, logros y nivel de las semanas selladas, sin votos individuales', async () => {
    // Tres semanas: A gana las dos primeras y queda 2.º en la tercera (la de B).
    s = await simSeason({
      count: 3,
      producers: 2,
      stars: (w, p) => ((w < 2 ? p === 0 : p === 1) ? [5, 5, 5] : [4, 4, 4]),
    })
    const [a] = s.producers as [SimSeason['producers'][0]]
    for (const w of s.weeks) await s.tick(w.voteEndsAt)
    const res = await get(s.t, '/api/profiles/prod0')
    const profile = PublicProfileSchema.parse(res.json().data)
    expect(profile.game.history.map((row) => [row.weekNumber, row.position, row.votes])).toEqual([
      [3, 2, 3],
      [2, 1, 3],
      [1, 1, 3],
    ])
    expect(profile.game.history[0]?.cover).toEqual({ kind: 'generative', seed: expect.any(Number) })
    expect(profile.game.stats).toMatchObject({
      bestPosition: 1,
      streak: { current: 3, best: 3 },
      goldenEars: 0,
      votesCast: 0,
      season: { id: '2026-T4', points: 25 + 25 + 18, position: 1 },
    })
    expect(profile.game.stats.meanScoreMilli).toBe(
      Math.round(profile.game.history.reduce((sum, row) => sum + row.scoreMilli, 0) / 3),
    )
    expect(profile.game.achievements.map((x) => x.id)).toEqual(['streak_3', 'podium', 'win', 'double'])
    // El XP público es el del libro (todo de semanas selladas) y el nivel, el suyo.
    const ledger = await s.t.db.select().from(xpEvent).where(eq(xpEvent.userId, a.id))
    const total = ledger.reduce((sum, row) => sum + row.amount, 0)
    expect(profile.xp).toBe(total)
    expect(profile.game.level).toBe(levelOf(total))
    // Ni estrellas ni votantes.
    expect(res.body).not.toMatch(/"stars"|sim-voter/)
  })
})
