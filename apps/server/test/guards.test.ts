import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { requireSession, requireVerified } from '../src/auth/guards'
import { user } from '../src/db/schema'
import { createAccount, makeApp } from './helpers'

/** Rutas de prueba: una que pide sesión, otra que pide email verificado y dos de admin. */
const testRoutes = (app: import('fastify').FastifyInstance) => {
  app.get('/api/prueba/sesion', { preHandler: requireSession }, async (req) => ({
    data: { id: req.user?.id },
  }))
  app.post('/api/prueba/votar', { preHandler: requireVerified }, async () => ({ data: { ok: true } }))
  app.get('/api/admin/prueba', async () => ({ data: { admin: true } }))
  app.post('/api/admin/semanas', async () => ({ data: { admin: true } }))
}

describe('guardas de ruta (§2.2)', () => {
  it('sin sesión → 401', async () => {
    const t = await makeApp({ routes: testRoutes })
    const res = await t.app.inject({ method: 'GET', url: '/api/prueba/sesion' })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('UNAUTHORIZED')
  })

  it('RF-AUTH-01: sin email verificado no se vota (403 EMAIL_NOT_VERIFIED); verificado, sí', async () => {
    const t = await makeApp({ routes: testRoutes })
    const pending = await createAccount(t, { email: 'nueva@example.com', username: 'nueva', verify: false })
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/prueba/votar',
      headers: { cookie: pending.cookie, origin: 'http://localhost:5173' },
      payload: {},
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('EMAIL_NOT_VERIFIED')
    const ok = await createAccount(t, { email: 'aina@example.com', username: 'aina' })
    const voted = await t.app.inject({
      method: 'POST',
      url: '/api/prueba/votar',
      headers: { cookie: ok.cookie, origin: 'http://localhost:5173' },
      payload: {},
    })
    expect(voted.statusCode).toBe(200)
  })

  it('RF-AUTH-03: cada ruta de /api/admin exige el rol admin (un productor recibe 403)', async () => {
    const t = await makeApp({ routes: testRoutes })
    const producer = await createAccount(t, { email: 'aina@example.com', username: 'aina' })
    const admin = await createAccount(t, { email: 'jefa@example.com', username: 'jefa' })
    await t.db.update(user).set({ role: 'admin' }).where(eq(user.id, admin.id))
    for (const [method, url] of [
      ['GET', '/api/admin/prueba'],
      ['POST', '/api/admin/semanas'],
    ] as const) {
      const headers = (cookie?: string) => ({
        origin: 'http://localhost:5173',
        ...(cookie ? { cookie } : {}),
      })
      expect(
        (await t.app.inject({ method, url, headers: headers(), payload: method === 'POST' ? {} : undefined }))
          .statusCode,
      ).toBe(401)
      expect(
        (
          await t.app.inject({
            method,
            url,
            headers: headers(producer.cookie),
            payload: method === 'POST' ? {} : undefined,
          })
        ).statusCode,
      ).toBe(403)
      expect(
        (
          await t.app.inject({
            method,
            url,
            headers: headers(admin.cookie),
            payload: method === 'POST' ? {} : undefined,
          })
        ).statusCode,
      ).toBe(200)
    }
  })

  it('RF-AUTH-02: bloquear revoca la sesión: la siguiente petición autenticada da 401 (y no puede volver a entrar)', async () => {
    const t = await makeApp({ routes: testRoutes })
    const victim = await createAccount(t, { email: 'aina@example.com', username: 'aina' })
    const admin = await createAccount(t, { email: 'jefa@example.com', username: 'jefa' })
    await t.db.update(user).set({ role: 'admin' }).where(eq(user.id, admin.id))
    expect(
      (await t.app.inject({ method: 'GET', url: '/api/prueba/sesion', headers: { cookie: victim.cookie } }))
        .statusCode,
    ).toBe(200)
    const ban = await t.app.inject({
      method: 'POST',
      url: '/api/auth/admin/ban-user',
      headers: { cookie: admin.cookie, origin: 'http://localhost:5173' },
      payload: { userId: victim.id, banReason: 'votos falsos' },
    })
    expect(ban.statusCode).toBe(200)
    expect(
      (await t.app.inject({ method: 'GET', url: '/api/prueba/sesion', headers: { cookie: victim.cookie } }))
        .statusCode,
    ).toBe(401)
    const again = await t.app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { origin: 'http://localhost:5173' },
      payload: { email: 'aina@example.com', password: 'lluvia en gràcia 92' },
    })
    expect(again.statusCode).toBe(403)
  })
})
