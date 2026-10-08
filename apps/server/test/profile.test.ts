import { describe, expect, it } from 'vitest'
import { createAccount, makeApp, ORIGIN, type TestApp } from './helpers'

const DAY = 24 * 60 * 60 * 1000

const get = (t: TestApp, url: string, cookie?: string) =>
  t.app.inject({ method: 'GET', url, headers: cookie ? { cookie } : {} })
const put = (t: TestApp, url: string, cookie: string, payload: object) =>
  t.app.inject({ method: 'PUT', url, headers: { cookie, origin: ORIGIN }, payload })

describe('perfil público (§2.3, §3.8.10)', () => {
  it('RF-PRF-01: /api/profiles/:username da los campos (sin email ni ids) y 404 si no existe', async () => {
    const t = await makeApp()
    const { cookie } = await createAccount(t, { email: 'kairo@example.com', username: 'Kairo.wav' })
    await put(t, '/api/me/profile', cookie, {
      bio: '  Flips de vinilo en Gràcia.  ',
      city: 'Barcelona',
      accent: 'wine',
      links: { instagram: 'instagram.com/kairo.wav' },
    })
    const res = await get(t, '/api/profiles/KAIRO.WAV')
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toEqual({
      username: 'kairo.wav',
      displayUsername: 'Kairo.wav',
      cardNumber: 1,
      joinedAt: expect.any(Number),
      xp: 0,
      bio: 'Flips de vinilo en Gràcia.',
      city: 'Barcelona',
      links: { instagram: 'https://instagram.com/kairo.wav' },
      accent: 'wine',
      avatarUrl: null,
    })
    expect(res.body).not.toMatch(/kairo@example\.com/)
    const missing = await get(t, '/api/profiles/nadie')
    expect(missing.statusCode).toBe(404)
    expect(missing.json().error.code).toBe('NOT_FOUND')
  })

  it('una cuenta suspendida no tiene perfil público', async () => {
    const t = await makeApp()
    const { id } = await createAccount(t, { email: 'aina@example.com', username: 'aina' })
    await t.db.$client.execute({ sql: 'update user set banned = 1 where id = ?', args: [id] })
    expect((await get(t, '/api/profiles/aina')).statusCode).toBe(404)
  })
})

describe('edición del perfil', () => {
  it('valida: bio de 160, enlaces solo de su sitio y en https, acento de la paleta; vacío borra', async () => {
    const t = await makeApp()
    const { cookie } = await createAccount(t, { email: 'aina@example.com', username: 'aina' })
    expect((await put(t, '/api/me/profile', cookie, { bio: 'x'.repeat(161) })).statusCode).toBe(422)
    expect((await put(t, '/api/me/profile', cookie, { accent: 'blue' })).statusCode).toBe(422)
    const wrongSite = await put(t, '/api/me/profile', cookie, {
      links: { spotify: 'https://evil.example/spotify' },
    })
    expect(wrongSite.statusCode).toBe(422)
    expect(wrongSite.json().error).toMatchObject({ code: 'INVALID_LINK', details: { kind: 'spotify' } })
    expect(
      (await put(t, '/api/me/profile', cookie, { links: { youtube: 'http://youtube.com/@aina' } }))
        .statusCode,
    ).toBe(422)
    expect(
      (await put(t, '/api/me/profile', cookie, { links: { youtube: 'javascript:alert(1)' } })).statusCode,
    ).toBe(422)
    const ok = await put(t, '/api/me/profile', cookie, {
      bio: 'Hola',
      links: { youtube: 'https://www.youtube.com/@aina', beatstars: 'beatstars.com/aina' },
    })
    expect(ok.json().data.links).toEqual({
      youtube: 'https://www.youtube.com/@aina',
      beatstars: 'https://beatstars.com/aina',
    })
    const cleared = await put(t, '/api/me/profile', cookie, { bio: '', links: { youtube: null } })
    expect(cleared.json().data).toMatchObject({
      bio: null,
      links: { beatstars: 'https://beatstars.com/aina' },
    })
  })

  it('RNF-SEC-02: 30 cambios de perfil por hora; el 31 da 429 con Retry-After', async () => {
    const t = await makeApp()
    const { cookie } = await createAccount(t, { email: 'aina@example.com', username: 'aina' })
    for (let i = 0; i < 30; i++)
      expect((await put(t, '/api/me/profile', cookie, { city: `Ciudad ${i}` })).statusCode).toBe(200)
    const limited = await put(t, '/api/me/profile', cookie, { city: 'Una más' })
    expect(limited.statusCode).toBe(429)
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0)
    t.clock.advance(60 * 60 * 1000)
    expect((await put(t, '/api/me/profile', cookie, { city: 'Otra hora' })).statusCode).toBe(200)
  })

  it('RNF-SEC-03: sin sesión no se edita, y cada uno edita solo el suyo', async () => {
    const t = await makeApp()
    const a = await createAccount(t, { email: 'aina@example.com', username: 'aina' })
    await createAccount(t, { email: 'bru@example.com', username: 'bru' })
    const anonymous = await t.app.inject({
      method: 'PUT',
      url: '/api/me/profile',
      headers: { origin: ORIGIN },
      payload: { city: 'X' },
    })
    expect(anonymous.statusCode).toBe(401)
    await put(t, '/api/me/profile', a.cookie, { city: 'Girona' })
    expect((await get(t, '/api/profiles/bru')).json().data.city).toBeNull()
    expect((await get(t, '/api/profiles/aina')).json().data.city).toBe('Girona')
  })
})

describe('cambio de nombre (RF-PRF-03)', () => {
  it('RF-PRF-03: /p/antiguo → 301 a /p/nuevo durante 30 días; nadie más lo coge mientras', async () => {
    const t = await makeApp()
    const { cookie } = await createAccount(t, { email: 'aina@example.com', username: 'aina' })
    const bru = await createAccount(t, { email: 'bru@example.com', username: 'bru' })
    const res = await put(t, '/api/me/username', cookie, { username: 'Aina.Beats' })
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toMatchObject({ username: 'aina.beats', displayUsername: 'Aina.Beats' })
    expect(res.json().data.usernameChangeAvailableAt).toBe(t.clock.now() + 30 * DAY)
    const old = await get(t, '/api/profiles/aina')
    expect(old.statusCode).toBe(301)
    expect(old.headers.location).toBe('/api/profiles/aina.beats')
    // El anterior está retenido para su dueña.
    const taken = await put(t, '/api/me/username', bru.cookie, { username: 'aina' })
    expect(taken.statusCode).toBe(409)
    expect(taken.json().error.code).toBe('USERNAME_TAKEN')
    // A los 30 días, la redirección caduca y el nombre queda libre.
    t.clock.advance(30 * DAY + 1)
    expect((await get(t, '/api/profiles/aina')).statusCode).toBe(404)
    expect((await put(t, '/api/me/username', bru.cookie, { username: 'aina' })).statusCode).toBe(200)
    expect((await get(t, '/api/profiles/aina')).json().data.displayUsername).toBe('aina')
  })

  it('RF-PRF-03: una vez cada 30 días; cambiar solo mayúsculas no cuenta', async () => {
    const t = await makeApp()
    const { cookie } = await createAccount(t, { email: 'aina@example.com', username: 'aina' })
    expect((await put(t, '/api/me/username', cookie, { username: 'AINA' })).json().data).toMatchObject({
      username: 'aina',
      displayUsername: 'AINA',
      usernameChangeAvailableAt: null,
    })
    expect((await put(t, '/api/me/username', cookie, { username: 'aina2' })).statusCode).toBe(200)
    t.clock.advance(29 * DAY)
    const soon = await put(t, '/api/me/username', cookie, { username: 'aina3' })
    expect(soon.statusCode).toBe(409)
    expect(soon.json().error).toMatchObject({
      code: 'USERNAME_CHANGE_TOO_SOON',
      details: { availableAt: t.clock.now() + DAY },
    })
    // Volver al nombre anterior tampoco se salta el plazo, pero pasado el plazo se puede.
    t.clock.advance(DAY)
    expect((await put(t, '/api/me/username', cookie, { username: 'aina' })).statusCode).toBe(200)
    expect((await get(t, '/api/profiles/aina')).statusCode).toBe(200)
  })

  it('RF-AUTH-06: reservados, formato y nombres de otros se rechazan con su código', async () => {
    const t = await makeApp()
    const { cookie } = await createAccount(t, { email: 'aina@example.com', username: 'aina' })
    await createAccount(t, { email: 'bru@example.com', username: 'bru' })
    const code = async (username: string) =>
      (await put(t, '/api/me/username', cookie, { username })).json().error?.code
    expect(await code('Ad.min')).toBe('USERNAME_RESERVED')
    expect(await code('con espacio')).toBe('USERNAME_INVALID')
    expect(await code('BRU')).toBe('USERNAME_TAKEN')
    expect(await code('ab')).toBe('VALIDATION_FAILED')
  })

  it('RF-PRF-03: el update-user de Better Auth no cambia el nombre (se saltaría el plazo)', async () => {
    const t = await makeApp()
    const { cookie } = await createAccount(t, { email: 'aina@example.com', username: 'aina' })
    for (const payload of [{ username: 'otra' }, { displayUsername: 'OTRA' }]) {
      const res = await t.app.inject({
        method: 'POST',
        url: '/api/auth/update-user',
        headers: { cookie, origin: ORIGIN },
        payload,
      })
      expect(res.statusCode).toBe(403)
    }
    expect((await get(t, '/api/profiles/aina')).json().data.displayUsername).toBe('aina')
  })
})
