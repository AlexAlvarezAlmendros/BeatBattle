import { describe, expect, it } from 'vitest'
import { createAccount, makeApp, ORIGIN, TEST_PASSWORD, type TestApp } from './helpers'

const FIREFOX_ANDROID = 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0'

async function signInFrom(t: TestApp, email: string, userAgent: string): Promise<string> {
  const res = await t.app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin: ORIGIN, 'user-agent': userAgent },
    remoteAddress: '198.51.100.251',
    payload: { email, password: TEST_PASSWORD },
  })
  const cookie = String(res.headers['set-cookie'] ?? '').match(/bb\.session_token=[^;]+/)?.[0]
  if (!cookie) throw new Error(`no entró: ${res.statusCode} ${res.body}`)
  return cookie
}

const list = (t: TestApp, cookie?: string) =>
  t.app.inject({ method: 'GET', url: '/api/me/sessions', headers: cookie ? { cookie } : {} })

const close = (t: TestApp, cookie: string, id: string) =>
  t.app.inject({ method: 'DELETE', url: `/api/me/sessions/${id}`, headers: { cookie, origin: ORIGIN } })

describe('Ajustes → Sesiones', () => {
  it('RF-AUTH-10: lista navegador y última actividad, la actual primero, sin token ni IP', async () => {
    const t = await makeApp()
    const { cookie } = await createAccount(t, { email: 'aina@example.com', username: 'aina' })
    const phone = await signInFrom(t, 'aina@example.com', FIREFOX_ANDROID)
    expect((await list(t)).statusCode).toBe(401)
    const res = await list(t, phone)
    expect(res.statusCode).toBe(200)
    const sessions = res.json().data as Array<Record<string, unknown>>
    expect(sessions).toHaveLength(2)
    expect(sessions[0]).toMatchObject({ current: true, device: 'Firefox en Android' })
    expect(sessions[1]).toMatchObject({ current: false })
    for (const item of sessions) {
      expect(Object.keys(item).sort()).toEqual(['createdAt', 'current', 'device', 'id', 'lastActiveAt'])
      expect(typeof item.lastActiveAt).toBe('number')
    }
    expect(res.body).not.toMatch(/token|198\.51\.100/)
    // Desde la otra, la actual es la otra.
    const fromDesktop = (await list(t, cookie)).json().data as Array<{ id: string; current: boolean }>
    expect(fromDesktop[0]?.id).toBe(sessions[1]?.id)
  })

  it('RF-AUTH-10: cerrar una sesión la revoca; la actual no se cierra así', async () => {
    const t = await makeApp()
    const { cookie } = await createAccount(t, { email: 'aina@example.com', username: 'aina' })
    const phone = await signInFrom(t, 'aina@example.com', FIREFOX_ANDROID)
    const [current, other] = (await list(t, cookie)).json().data as Array<{ id: string }>
    expect((await close(t, cookie, current?.id as string)).statusCode).toBe(400)
    expect((await close(t, cookie, other?.id as string)).statusCode).toBe(200)
    expect((await list(t, phone)).statusCode).toBe(401)
    expect((await list(t, cookie)).json().data).toHaveLength(1)
    expect((await close(t, cookie, other?.id as string)).statusCode).toBe(404)
  })

  it('RNF-SEC-03: A no ve ni cierra las sesiones de B', async () => {
    const t = await makeApp()
    const a = await createAccount(t, { email: 'aina@example.com', username: 'aina' })
    const b = await createAccount(t, { email: 'bru@example.com', username: 'bru' })
    const [bSession] = (await list(t, b.cookie)).json().data as Array<{ id: string }>
    const aSees = (await list(t, a.cookie)).json().data as Array<{ id: string }>
    expect(aSees.map((item) => item.id)).not.toContain(bSession?.id)
    expect((await close(t, a.cookie, bSession?.id as string)).statusCode).toBe(404)
    expect((await list(t, b.cookie)).statusCode).toBe(200)
  })
})
