import { describe, expect, it } from 'vitest'
import { DEV_AUTH_SECRET } from '../src/config/env'
import { createAccount, makeApp, ORIGIN, TEST_PASSWORD, testConfig } from './helpers'

describe('cookies (§4.14, RNF-PRIV-03)', () => {
  it('RNF-PRIV-03: en producción (HTTPS) la sesión va en __Secure-bb.*, HttpOnly, Secure y SameSite=Lax; nada más', async () => {
    const base = testConfig()
    const t = await makeApp({
      config: { auth: { ...base.auth, secret: DEV_AUTH_SECRET, secureCookies: true } },
    })
    await createAccount(t, { email: 'aina@example.com', username: 'aina' })
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { origin: ORIGIN },
      payload: { email: 'aina@example.com', password: TEST_PASSWORD },
    })
    const raw = res.headers['set-cookie']
    const cookies = (Array.isArray(raw) ? raw : [raw]).filter(Boolean).map(String)
    expect(cookies.length).toBeGreaterThan(0)
    for (const cookie of cookies) {
      expect(cookie).toMatch(/^__Secure-bb\./)
      expect(cookie).toMatch(/; HttpOnly/i)
      expect(cookie).toMatch(/; Secure/i)
      expect(cookie).toMatch(/; SameSite=Lax/i)
    }
  })
})
