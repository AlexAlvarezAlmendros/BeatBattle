import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { producerProfile, user } from '../src/db/schema'
import type { MemoryMailer } from '../src/email/mailer'
import { makeApp, ORIGIN, type TestApp } from './helpers'

/** Contraseñas «filtradas» del HIBP simulado (`RF-AUTH-07`). */
const PWNED = new Set(['password123456'])
const realFetch = globalThis.fetch

beforeEach(() => {
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input)
    if (!url.includes('api.pwnedpasswords.com')) return realFetch(input, init)
    const prefix = url.split('/range/')[1]?.slice(0, 5).toUpperCase() ?? ''
    const lines = [...PWNED]
      .map((p) => createHash('sha1').update(p).digest('hex').toUpperCase())
      .filter((hash) => hash.startsWith(prefix))
      .map((hash) => `${hash.slice(5)}:4242`)
    return new Response([...lines, '0000000000000000000000000000000000A:1'].join('\r\n'), { status: 200 })
  })
})
afterEach(() => vi.unstubAllGlobals())

const GOOD_PASSWORD = 'lluvia en gràcia 92'

function signUp(t: TestApp, body: Partial<Record<string, string>>, ip = '203.0.113.1') {
  return t.app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: { origin: ORIGIN, 'x-forwarded-for': ip },
    remoteAddress: ip,
    payload: {
      email: 'aina@example.com',
      password: GOOD_PASSWORD,
      name: 'Aina',
      username: 'aina',
      callbackURL: '/verificar',
      ...body,
    },
  })
}

function signIn(t: TestApp, body: Record<string, string>, ip = '203.0.113.1') {
  return t.app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin: ORIGIN },
    remoteAddress: ip,
    payload: body,
  })
}

const mailer = (t: TestApp) => t.app.email.mailer as MemoryMailer
const code = (res: { json(): unknown }) => (res.json() as { code?: string }).code

describe('cuentas con Better Auth (§2.3, §4.9)', () => {
  it('RF-AUTH-04: registro → email de verificación → abrir el enlace → sesión iniciada y emailVerified', async () => {
    const t = await makeApp()
    const res = await signUp(t, { username: 'LilBru', displayUsername: 'LilBru', name: 'LilBru' })
    expect(res.statusCode).toBe(200)
    // Sin verificar, no hay sesión.
    expect(res.headers['set-cookie']).toBeUndefined()
    const email = mailer(t).lastTo('aina@example.com')
    expect(email?.subject).toBe('Confirma tu email y entra en la batalla')
    expect(email?.text).toContain('LilBru')
    const link = email?.text.match(/https?:\/\/\S+verify-email\?\S+/)?.[0]
    expect(link).toBeDefined()
    const verify = await t.app.inject({
      method: 'GET',
      url: new URL(link as string).pathname + new URL(link as string).search,
    })
    expect([200, 302]).toContain(verify.statusCode)
    const cookies = String(verify.headers['set-cookie'])
    expect(cookies).toMatch(/bb\.session_token=/)
    const [account] = await t.db.select().from(user).where(eq(user.email, 'aina@example.com'))
    expect(account).toMatchObject({ emailVerified: true, username: 'lilbru', displayUsername: 'LilBru' })
    const [profile] = await t.db
      .select()
      .from(producerProfile)
      .where(eq(producerProfile.userId, account?.id as string))
    expect(profile).toMatchObject({ cardNumber: 1, accent: 'red' })
  })

  it('sin verificar el email no se entra: 403 EMAIL_NOT_VERIFIED (y se reenvía la verificación)', async () => {
    const t = await makeApp()
    await signUp(t, {})
    const res = await signIn(t, { email: 'aina@example.com', password: GOOD_PASSWORD })
    expect(res.statusCode).toBe(403)
    expect(code(res)).toBe('EMAIL_NOT_VERIFIED')
  })

  it('RF-AUTH-06: LilBru y lilbru chocan; admin se rechaza con USERNAME_RESERVED', async () => {
    const t = await makeApp()
    expect((await signUp(t, { username: 'LilBru' })).statusCode).toBe(200)
    const clash = await signUp(t, { email: 'otra@example.com', username: 'lilbru' })
    expect(clash.statusCode).toBe(400)
    expect(code(clash)).toBe('USERNAME_IS_ALREADY_TAKEN')
    const reserved = await signUp(t, { email: 'admin@example.com', username: 'admin' }, '203.0.113.2')
    expect(code(reserved)).toBe('USERNAME_RESERVED')
    expect(reserved.statusCode).toBe(422)
  })

  it('RF-AUTH-07: 11 caracteres → PASSWORD_TOO_SHORT; password123456 → PASSWORD_COMPROMISED', async () => {
    const t = await makeApp()
    expect(code(await signUp(t, { password: 'a'.repeat(11) }))).toBe('PASSWORD_TOO_SHORT')
    expect(code(await signUp(t, { password: 'password123456' }))).toBe('PASSWORD_COMPROMISED')
    expect(code(await signUp(t, { password: 'a'.repeat(129) }, '203.0.113.3'))).toBe('PASSWORD_TOO_LONG')
  })

  it('RF-AUTH-09: x@mailinator.com (y sus subdominios) → EMAIL_DISPOSABLE', async () => {
    const t = await makeApp()
    const res = await signUp(t, { email: 'x@mailinator.com' })
    expect(res.statusCode).toBe(422)
    expect(code(res)).toBe('EMAIL_DISPOSABLE')
    expect(code(await signUp(t, { email: 'x@eu.mailinator.com', username: 'otro' }))).toBe('EMAIL_DISPOSABLE')
    expect(await t.db.select().from(user)).toHaveLength(0)
  })

  it('RNF-SEC-02: entrar, 5 por minuto e IP; registrarse, 3 por hora e IP', async () => {
    const t = await makeApp()
    const tries = []
    for (let i = 0; i < 6; i++)
      tries.push((await signIn(t, { email: 'nadie@example.com', password: GOOD_PASSWORD })).statusCode)
    expect(tries.slice(0, 5).every((s) => s !== 429)).toBe(true)
    expect(tries[5]).toBe(429)
    // Otra IP no se ve afectada.
    expect(
      (await signIn(t, { email: 'nadie@example.com', password: GOOD_PASSWORD }, '198.51.100.7')).statusCode,
    ).not.toBe(429)
    const ups = []
    for (let i = 0; i < 4; i++)
      ups.push((await signUp(t, { email: `p${i}@example.com`, username: `p${i}xx` }, '192.0.2.9')).statusCode)
    expect(ups.slice(0, 3).every((s) => s === 200)).toBe(true)
    expect(ups[3]).toBe(429)
  })

  it('RNF-SEC-02: pedir la recuperación, 3 por hora e IP', async () => {
    const t = await makeApp()
    const statuses = []
    for (let i = 0; i < 4; i++)
      statuses.push(
        (
          await t.app.inject({
            method: 'POST',
            url: '/api/auth/request-password-reset',
            headers: { origin: ORIGIN },
            remoteAddress: '192.0.2.50',
            payload: { email: 'aina@example.com', redirectTo: '/recuperar' },
          })
        ).statusCode,
      )
    expect(statuses.slice(0, 3).every((s) => s === 200)).toBe(true)
    expect(statuses[3]).toBe(429)
  })

  it('cada cuenta nueva recibe el siguiente número de carta', async () => {
    const t = await makeApp()
    await signUp(t, { email: 'a@example.com', username: 'aaa' }, '192.0.2.1')
    await signUp(t, { email: 'b@example.com', username: 'bbb' }, '192.0.2.2')
    const cards = (await t.db.select().from(producerProfile)).map((p) => p.cardNumber).sort()
    expect(cards).toEqual([1, 2])
  })
})
