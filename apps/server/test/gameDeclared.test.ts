import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { achievementUnlock, producerProfile, xpEvent } from '../src/db/schema'
import { DECLARED_ACHIEVEMENTS_PER_HOUR } from '../src/modules/game/routes'
import { type Battle, battle, W42 } from './fixtures/battle'
import { createAccount, makeApp, ORIGIN, type TestApp } from './helpers'

// Sellar una semana en la CI pasa de los 5 s.
vi.setConfig({ testTimeout: 60_000 })

/**
 * Los logros que ocurren en el navegador (guía §4.10, Anexo C; tarea 7.14, hueco G5): una ruta con lista blanca (en la
 * Fase 7, solo `share_card`), con límite por hora y sin más XP que el del logro.
 */

let t: TestApp | Battle['t']
afterEach(async () => {
  await t?.app.close()
})

const declare = (cookie: string | null, payload: unknown) =>
  t.app.inject({
    method: 'POST',
    url: '/api/me/achievements',
    headers: { ...(cookie ? { cookie } : {}), origin: ORIGIN, 'content-type': 'application/json' },
    payload: payload as object,
  })

describe('logros que declara el navegador (7.14, §4.10)', () => {
  it('RF-GAME-05: share_card da su logro y su XP (25) una vez; repetirlo no suma', async () => {
    t = await makeApp()
    const { id, cookie } = await createAccount(t, { email: 'lil@example.com', username: 'lilbru' })
    const first = await declare(cookie, { achievement: 'share_card', card: { kind: 'producer' } })
    expect(first.statusCode, first.body).toBe(200)
    expect(first.json().data).toEqual({ xp: 25, achievements: ['share_card'], level: 1 })
    const again = await declare(cookie, { achievement: 'share_card', card: { kind: 'producer' } })
    expect(again.json().data).toEqual({ xp: 0, achievements: [], level: 1 })
    expect(await t.db.select().from(xpEvent).where(eq(xpEvent.userId, id))).toMatchObject([
      { kind: 'achievement', ref: 'share_card', amount: 25, weekId: null },
    ])
    expect(await t.db.select().from(achievementUnlock).where(eq(achievementUnlock.userId, id))).toMatchObject(
      [{ achievementId: 'share_card', ref: null, weekId: null }],
    )
    const [profile] = await t.db
      .select({ xp: producerProfile.xp })
      .from(producerProfile)
      .where(eq(producerProfile.userId, id))
    expect(profile?.xp).toBe(25)
  })

  it('RF-GAME-05: un logro fuera de la lista blanca → 422 (ni los de resultado, ni los secretos aún, ni inventados)', async () => {
    t = await makeApp()
    const { id, cookie } = await createAccount(t, { email: 'lil@example.com', username: 'lilbru' })
    for (const payload of [
      { achievement: 'win' },
      { achievement: 'level_20' },
      { achievement: 'konami' },
      { achievement: 'inventado' },
      { achievement: 'share_card', card: { kind: 'producer' }, xp: 500 },
      { achievement: 'share_card' },
      {},
    ]) {
      const res = await declare(cookie, payload)
      expect(res.statusCode, JSON.stringify(payload)).toBe(422)
      expect(res.json().error.code).toBe('VALIDATION_FAILED')
    }
    expect(await t.db.select().from(xpEvent).where(eq(xpEvent.userId, id))).toEqual([])
  })

  it('§4.10: sin sesión, 401', async () => {
    t = await makeApp()
    expect((await declare(null, { achievement: 'share_card', card: { kind: 'producer' } })).statusCode).toBe(
      401,
    )
  })

  it(`§4.13: como mucho ${DECLARED_ACHIEVEMENTS_PER_HOUR} por hora y cuenta (la siguiente → 429); a la hora, otra vez`, async () => {
    t = await makeApp()
    const { cookie } = await createAccount(t, { email: 'lil@example.com', username: 'lilbru' })
    for (let i = 0; i < DECLARED_ACHIEVEMENTS_PER_HOUR; i++)
      expect(
        (await declare(cookie, { achievement: 'share_card', card: { kind: 'producer' } })).statusCode,
      ).toBe(200)
    const limited = await declare(cookie, { achievement: 'share_card', card: { kind: 'producer' } })
    expect(limited.statusCode).toBe(429)
    t.clock.advance(60 * 60 * 1000 + 1)
    expect(
      (await declare(cookie, { achievement: 'share_card', card: { kind: 'producer' } })).statusCode,
    ).toBe(200)
  })

  it('§2.10 / G1 (7.28): el share_card de «Estoy en la batalla» lleva la semana de la entrada y no sale en el perfil público hasta el sellado', async () => {
    const b = await battle({ producers: 2, voters: 0 })
    t = b.t
    const [own, other] = b.producers as [Battle['producers'][0], Battle['producers'][0]]
    const publicProfile = async () =>
      (await t.app.inject({ method: 'GET', url: '/api/profiles/prod0' })).json().data
    const before = JSON.stringify(await publicProfile())

    const res = await declare(own.cookie, {
      achievement: 'share_card',
      card: { kind: 'battle', entryId: own.entryId },
    })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json().data).toEqual({ xp: 25, achievements: ['share_card'], level: 1 })
    expect(
      await t.db.select().from(achievementUnlock).where(eq(achievementUnlock.userId, own.id)),
    ).toMatchObject([{ achievementId: 'share_card', ref: own.entryId, weekId: b.weekId }])
    expect(await t.db.select().from(xpEvent).where(eq(xpEvent.userId, own.id))).toMatchObject([
      { kind: 'achievement', ref: 'share_card', amount: 25, weekId: b.weekId },
    ])
    // En voto ciego, el perfil público sigue byte a byte igual: ni el logro ni su XP dicen que participa.
    expect(JSON.stringify(await publicProfile())).toBe(before)
    // `me` es suyo y va en vivo.
    const me = (await t.app.inject({ method: 'GET', url: '/api/me', headers: { cookie: own.cookie } })).json()
      .data
    expect(me.game.xp).toBeGreaterThanOrEqual(25)

    // Sellada la semana, ya es público.
    t.clock.set(W42.voteEndsAt)
    await t.app.inject({ method: 'GET', url: '/api/weeks/2026-w42/results' })
    const sealed = await publicProfile()
    expect(sealed.game.achievements.map((a: { id: string }) => a.id)).toContain('share_card')

    // La entrada de otro no vale (ni dice nada de ella).
    const foreign = await declare(own.cookie, {
      achievement: 'share_card',
      card: { kind: 'battle', entryId: other.entryId },
    })
    expect(foreign.statusCode).toBe(404)
    expect(foreign.json().error.code).toBe('NOT_FOUND')
  })

  it('§2.10 (7.28): las tarjetas del puesto y de la carta no son de ninguna semana', async () => {
    const b = await battle({ producers: 1, voters: 0 })
    t = b.t
    const own = b.producers[0] as Battle['producers'][0]
    expect(
      (await declare(own.cookie, { achievement: 'share_card', card: { kind: 'result' } })).statusCode,
    ).toBe(200)
    expect(
      await t.db.select().from(achievementUnlock).where(eq(achievementUnlock.userId, own.id)),
    ).toMatchObject([{ achievementId: 'share_card', ref: null, weekId: null }])
    const profile = (await t.app.inject({ method: 'GET', url: '/api/profiles/prod0' })).json().data
    expect(profile.game.achievements.map((a: { id: string }) => a.id)).toEqual(['share_card'])
  })
})
