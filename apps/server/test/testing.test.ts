import { describe, expect, it } from 'vitest'
import { createAccount, makeApp } from './helpers'

describe('buzón de los E2E (§4.15)', () => {
  it('con NODE_ENV=test da el último email a una dirección', async () => {
    const t = await makeApp()
    await createAccount(t, { email: 'aina@example.com', username: 'aina', verify: false })
    const res = await t.app.inject({ method: 'GET', url: '/api/test/mailbox?to=aina@example.com' })
    expect(res.json().data.text).toMatch(/verify-email\?token=/)
    expect(
      (await t.app.inject({ method: 'GET', url: '/api/test/mailbox?to=nadie@example.com' })).json(),
    ).toEqual({
      data: null,
    })
  })

  it('con NODE_ENV=test da el enlace de baja de un aviso', async () => {
    const t = await makeApp()
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/test/unsubscribe-link?to=Aina@example.com&kind=battle.drop',
    })
    expect(res.json().data.url).toMatch(/\/baja\?token=/)
  })

  it('fuera de test la ruta no existe', async () => {
    const t = await makeApp({ config: { env: 'development' } })
    expect(
      (await t.app.inject({ method: 'GET', url: '/api/test/mailbox?to=x@example.com' })).statusCode,
    ).toBe(404)
  })
})
