import { describe, expect, it } from 'vitest'
import { createAccount, makeApp } from './helpers'

describe('GET /api/me', () => {
  it('sin sesión, { data: null } (ser visitante no es un error); con sesión, la cuenta con su carta y su XP', async () => {
    const t = await makeApp()
    const anonymous = await t.app.inject({ method: 'GET', url: '/api/me' })
    expect(anonymous.statusCode).toBe(200)
    expect(anonymous.json()).toEqual({ data: null })
    const { cookie } = await createAccount(t, { email: 'lilbru@example.com', username: 'LilBru' })
    const res = await t.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    expect(res.json().data).toMatchObject({
      email: 'lilbru@example.com',
      emailVerified: true,
      username: 'lilbru',
      role: 'user',
      cardNumber: 1,
      xp: 0,
    })
  })
})
