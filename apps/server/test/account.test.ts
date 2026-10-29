import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { runBatch } from '../src/db/batch'
import { achievementUnlock, producerProfile, sample, streakState, week, xpEvent } from '../src/db/schema'
import type { MemoryMailer } from '../src/email/mailer'
import { createGameService } from '../src/modules/game/service'
import type { ImageStorage } from '../src/modules/storage/cloudinary'
import { createAccount, makeApp, ORIGIN, T0, TEST_PASSWORD, type TestApp } from './helpers'

const exportOf = (t: TestApp, cookie: string) =>
  t.app.inject({ method: 'GET', url: '/api/me/export', headers: { cookie } })
const remove = (t: TestApp, cookie: string, confirm: string) =>
  t.app.inject({
    method: 'DELETE',
    url: '/api/me',
    headers: { cookie, origin: ORIGIN },
    payload: { confirm },
  })

/** Todas las filas de todas las tablas, como texto, para buscar restos de una cuenta. */
async function everything(t: TestApp): Promise<Record<string, string>> {
  const tables = await t.db.$client.execute(
    "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '__drizzle%'",
  )
  const out: Record<string, string> = {}
  for (const { name } of tables.rows) {
    const rows = await t.db.$client.execute(`select * from "${String(name)}"`)
    out[String(name)] = JSON.stringify(rows.rows)
  }
  return out
}

function fakeImages() {
  const removed: string[] = []
  const images: ImageStorage = {
    prefix: 'bbt',
    signImageUpload: ({ publicId }) => ({ uploadUrl: 'https://x', publicId, fields: {} }),
    verifyImage: async (publicId) => ({
      publicId,
      format: 'png',
      width: 512,
      height: 512,
      bytes: 1,
      version: 1,
    }),
    imageUrl: (publicId, { size }) => `https://res.cloudinary.com/demo/w_${size}/${publicId}`,
    removeImage: async (publicId) => {
      removed.push(publicId)
    },
  }
  return { images, removed }
}

describe('exportar los datos (RF-PRF-05)', () => {
  it('RF-PRF-05: /api/me/export da cuenta, perfil, emails y consentimientos, sesiones y lo del juego, como descarga', async () => {
    const t = await makeApp()
    const { cookie } = await createAccount(t, { email: 'aina@example.com', username: 'Aina' })
    await t.app.inject({
      method: 'PUT',
      url: '/api/me/profile',
      headers: { cookie, origin: ORIGIN },
      payload: { city: 'Girona', links: { youtube: 'youtube.com/@aina' } },
    })
    await t.app.inject({
      method: 'PUT',
      url: '/api/me/email-prefs',
      headers: { cookie, origin: ORIGIN },
      payload: { marketing: true },
    })
    // Un aviso dirigido a la cuenta (los que van a una dirección suelta no se guardan tras enviarse).
    await t.app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: { cookie, origin: ORIGIN },
      payload: { currentPassword: TEST_PASSWORD, newPassword: 'otra contraseña larga 41' },
    })
    const res = await exportOf(t, cookie)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="beatbattle-aina-2026-10-05\.json"$/,
    )
    const data = res.json().data
    expect(data.format).toBe('beatbattle-export/1')
    expect(data.account).toMatchObject({
      email: 'aina@example.com',
      username: 'aina',
      displayUsername: 'Aina',
      signInMethods: [{ method: 'password' }],
    })
    expect(data.account.sessions.length).toBeGreaterThan(0)
    expect(data.profile).toMatchObject({
      cardNumber: 1,
      city: 'Girona',
      links: { youtube: 'https://youtube.com/@aina' },
    })
    expect(data.email.consents).toEqual([
      expect.objectContaining({ purpose: 'marketing', granted: true, source: 'ajustes' }),
    ])
    expect(data.email.emails.map((item: { kind: string }) => item.kind)).toContain('auth.security')
    expect(data.game).toEqual({
      entries: [],
      votes: [],
      listens: [],
      reports: [],
      ipSignals: [],
      xpEvents: [],
      achievements: [],
      streak: null,
    })
    // Nada que sirva para entrar: ni el hash de la contraseña ni los tokens de sesión.
    const accounts = await t.db.$client.execute('select password from account')
    const sessions = await t.db.$client.execute('select token from session')
    for (const secret of [...accounts.rows.map((r) => r.password), ...sessions.rows.map((r) => r.token)])
      expect(res.body).not.toContain(String(secret))
  })

  it('RNF-SEC-03: sin sesión no hay exportación', async () => {
    const t = await makeApp()
    expect((await t.app.inject({ method: 'GET', url: '/api/me/export' })).statusCode).toBe(401)
  })
})

describe('borrar la cuenta (RF-PRF-04)', () => {
  it('RF-PRF-04: con la confirmación escrita, no queda ningún dato personal; sale account.deleted y se cierra la sesión', async () => {
    const fake = fakeImages()
    const t = await makeApp({ images: fake.images })
    const { id, cookie } = await createAccount(t, { email: 'aina@example.com', username: 'aina' })
    const other = await createAccount(t, { email: 'bru@example.com', username: 'bru' })
    // Datos repartidos por los módulos: perfil, avatar, cambio de nombre, preferencias, consentimiento.
    const put = (url: string, payload: object) =>
      t.app.inject({ method: 'PUT', url, headers: { cookie, origin: ORIGIN }, payload })
    await put('/api/me/profile', { bio: 'Hola', city: 'Girona' })
    await put('/api/me/avatar', { publicId: `bbt/avatars/${id}/a` })
    await put('/api/me/username', { username: 'aina.beats' })
    await put('/api/me/email-prefs', { marketing: true, dropOn: false })
    await exportOf(t, cookie)

    expect((await remove(t, cookie, 'otra')).statusCode).toBe(422)
    const res = await remove(t, cookie, 'AINA.BEATS')
    expect(res.statusCode).toBe(200)
    expect(String(res.headers['set-cookie'])).toMatch(/bb\.session_token=; Path=\/; Max-Age=0/)
    // La sesión ya no vale.
    expect((await t.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json()).toEqual({
      data: null,
    })
    // El último email, a la dirección (la cuenta ya no existe).
    const farewell = (t.app.email.mailer as MemoryMailer).lastTo('aina@example.com')
    expect(farewell?.subject).toBe('Tu cuenta se ha borrado')
    // El avatar, fuera de Cloudinary.
    expect(fake.removed).toEqual([`bbt/avatars/${id}/a`])
    // Ni el id, ni el email, ni los nombres, en ninguna tabla.
    const tables = await everything(t)
    for (const [table, rows] of Object.entries(tables))
      for (const trace of [id, 'aina@example.com', 'aina.beats', '"aina"', 'Girona'])
        expect(rows.includes(trace), `${table} conserva ${trace}`).toBe(false)
    // La otra cuenta, intacta.
    expect(
      (await t.app.inject({ method: 'GET', url: '/api/me', headers: { cookie: other.cookie } })).json().data,
    ).toMatchObject({
      username: 'bru',
    })
    // El nombre y el email quedan libres.
    await createAccount(t, { email: 'aina@example.com', username: 'aina' })
  })

  it('§4.14: la supresión (solo el hash) se conserva tras borrar la cuenta', async () => {
    const t = await makeApp()
    const { cookie } = await createAccount(t, { email: 'aina@example.com', username: 'aina' })
    await t.db.$client.execute(
      "insert into email_suppression (email_hash, reason, created_at) values ('hash-de-aina', 'unsubscribed_all', 1)",
    )
    await remove(t, cookie, 'aina')
    expect((await t.db.$client.execute('select count(*) as n from email_suppression')).rows[0]?.n).toBe(1)
  })

  it('RNF-SEC-03: sin sesión no se borra nada', async () => {
    const t = await makeApp()
    const res = await t.app.inject({
      method: 'DELETE',
      url: '/api/me',
      headers: { origin: ORIGIN },
      payload: { confirm: 'x' },
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('la capa de juego en los datos de la cuenta (7.15, §4.14)', () => {
  let ids = 0
  /** Una semana sellada mínima (con su sample), para que la exportación diga su slug. */
  async function sealedWeek(t: TestApp): Promise<string> {
    await t.db.insert(sample).values({
      id: 'sample-1',
      title: 'Lluvia en Gràcia',
      credits: 'Other People Records',
      licenseText: 'Uso libre para la batalla.',
      durationMs: 6000,
      bytes: 1000,
      format: 'wav',
      audioPublicId: 'beatbattle-test/samples/s1/original',
      coverPublicId: 'beatbattle-test/samples/s1/cover',
      peaks: Buffer.alloc(2000),
      createdBy: 'admin',
      createdAt: T0,
    })
    await t.db.insert(week).values({
      id: 'week-41',
      number: 1,
      slug: '2026-w41',
      seasonId: '2026-T4',
      sampleId: 'sample-1',
      rulesVersion: 1,
      startsAt: T0,
      submitEndsAt: T0 + 100,
      voteEndsAt: T0 + 200,
      sealedAt: T0 + 300,
      createdBy: 'admin',
      createdAt: T0,
    })
    return 'week-41'
  }

  /** Lo que una cuenta ha jugado en la semana: subir, la primera entrada, un voto, el resultado y dos logros. */
  async function play(t: TestApp, userId: string, weekId: string, entries: { own: string; voted: string }) {
    const game = createGameService({ db: t.db, newId: () => `xp-${++ids}` })
    const plan = await game.plan(userId, {
      xp: [
        { kind: 'entry', ref: weekId, weekId, amount: 100 },
        { kind: 'first_entry_of_week', ref: weekId, weekId, amount: 25 },
        { kind: 'vote', ref: entries.voted, weekId, amount: 5, weeklyCap: 40 },
        { kind: 'result', ref: weekId, weekId, amount: 250 },
      ],
      achievements: [
        { id: 'first_entry', ref: entries.own, weekId },
        { id: 'podium', ref: weekId, weekId },
      ],
      now: T0 + 400,
    })
    await runBatch(t.db, [
      ...plan.statements,
      game.streakStatement(userId, { current: 3, best: 5, lastWeekNumber: 1, jokerSeason: '2026-T4' }),
    ])
  }

  it('RF-PRF-05: la exportación lleva el libro de XP, los logros y la racha, con la semana por su slug', async () => {
    const t = await makeApp()
    const { id, cookie } = await createAccount(t, { email: 'aina@example.com', username: 'aina' })
    await play(t, id, await sealedWeek(t), { own: 'entry-a', voted: 'entry-b' })
    const game = (await exportOf(t, cookie)).json().data.game
    expect(game.xpEvents).toEqual([
      { kind: 'achievement', ref: 'first_entry', week: '2026-w41', amount: 25, createdAt: T0 + 400 },
      { kind: 'achievement', ref: 'podium', week: '2026-w41', amount: 75, createdAt: T0 + 400 },
      { kind: 'entry', ref: 'week-41', week: '2026-w41', amount: 100, createdAt: T0 + 400 },
      { kind: 'first_entry_of_week', ref: 'week-41', week: '2026-w41', amount: 25, createdAt: T0 + 400 },
      { kind: 'result', ref: 'week-41', week: '2026-w41', amount: 250, createdAt: T0 + 400 },
      { kind: 'vote', ref: 'entry-b', week: '2026-w41', amount: 5, createdAt: T0 + 400 },
    ])
    expect(game.achievements).toEqual([
      { id: 'first_entry', ref: 'entry-a', week: '2026-w41', unlockedAt: T0 + 400, seenAt: null },
      { id: 'podium', ref: 'week-41', week: '2026-w41', unlockedAt: T0 + 400, seenAt: null },
    ])
    expect(game.streak).toEqual({ current: 3, best: 5, lastWeekNumber: 1, jokerSeason: '2026-T4' })
    // Con lo de las entradas y los votos, en la misma sección.
    expect(Object.keys(game)).toEqual(
      expect.arrayContaining(['entries', 'votes', 'xpEvents', 'achievements']),
    )
    // Y la caché del perfil, la suma del libro.
    expect((await exportOf(t, cookie)).json().data.profile.xp).toBe(480)
  })

  it('RF-PRF-04, RNF-PRIV-01: borrar la cuenta quita su XP, sus logros y su racha en el batch del borrado; lo de otros se queda', async () => {
    const t = await makeApp()
    const aina = await createAccount(t, { email: 'aina@example.com', username: 'aina' })
    const bru = await createAccount(t, { email: 'bru@example.com', username: 'bru' })
    const weekId = await sealedWeek(t)
    await play(t, aina.id, weekId, { own: 'entry-a', voted: 'entry-b' })
    // Bru vota la entrada de Aina (y no tiene la primera entrada: es de Aina).
    await play(t, bru.id, weekId, { own: 'entry-b', voted: 'entry-a' })
    const [before] = await t.db
      .select({ xp: producerProfile.xp })
      .from(producerProfile)
      .where(eq(producerProfile.userId, bru.id))

    expect((await remove(t, aina.cookie, 'aina')).statusCode).toBe(200)
    for (const table of [xpEvent, achievementUnlock, streakState])
      expect(await t.db.select().from(table).where(eq(table.userId, aina.id))).toEqual([])
    // Lo de Bru, intacto: también el XP del voto a la entrada de Aina.
    expect(await t.db.select().from(xpEvent).where(eq(xpEvent.userId, bru.id))).toHaveLength(5)
    expect(
      await t.db.select().from(achievementUnlock).where(eq(achievementUnlock.userId, bru.id)),
    ).toHaveLength(2)
    expect(await t.db.select().from(streakState).where(eq(streakState.userId, bru.id))).toHaveLength(1)
    const [after] = await t.db
      .select({ xp: producerProfile.xp })
      .from(producerProfile)
      .where(eq(producerProfile.userId, bru.id))
    expect(after?.xp).toBe(before?.xp)
    // Ni rastro de su id en las tablas de la capa de juego (el resto lo mira RF-PRF-04 arriba).
    const tables = await everything(t)
    for (const table of ['xp_event', 'achievement_unlock', 'streak_state'])
      expect(tables[table]?.includes(aina.id), `${table} conserva la cuenta`).toBe(false)
  })
})
