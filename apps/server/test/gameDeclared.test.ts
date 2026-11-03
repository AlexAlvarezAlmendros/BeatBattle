import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { achievementUnlock, producerProfile, xpEvent } from '../src/db/schema'
import { DECLARED_ACHIEVEMENTS_PER_HOUR } from '../src/modules/game/routes'
import { createAccount, makeApp, ORIGIN, type TestApp } from './helpers'

/**
 * Los logros que ocurren en el navegador (guía §4.10, Anexo C; tarea 7.14, hueco G5): una ruta con lista blanca (en la
 * Fase 7, solo `share_card`), con límite por hora y sin más XP que el del logro.
 */

let t: TestApp
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
    const first = await declare(cookie, { achievement: 'share_card' })
    expect(first.statusCode, first.body).toBe(200)
    expect(first.json().data).toEqual({ xp: 25, achievements: ['share_card'], level: 1 })
    const again = await declare(cookie, { achievement: 'share_card' })
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
      { achievement: 'share_card', xp: 500 },
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
    expect((await declare(null, { achievement: 'share_card' })).statusCode).toBe(401)
  })

  it(`§4.13: como mucho ${DECLARED_ACHIEVEMENTS_PER_HOUR} por hora y cuenta (la siguiente → 429); a la hora, otra vez`, async () => {
    t = await makeApp()
    const { cookie } = await createAccount(t, { email: 'lil@example.com', username: 'lilbru' })
    for (let i = 0; i < DECLARED_ACHIEVEMENTS_PER_HOUR; i++)
      expect((await declare(cookie, { achievement: 'share_card' })).statusCode).toBe(200)
    const limited = await declare(cookie, { achievement: 'share_card' })
    expect(limited.statusCode).toBe(429)
    t.clock.advance(60 * 60 * 1000 + 1)
    expect((await declare(cookie, { achievement: 'share_card' })).statusCode).toBe(200)
  })
})
