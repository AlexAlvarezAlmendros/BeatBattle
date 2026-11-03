import { describe, expect, it } from 'vitest'
import type { Mailer } from '../src/email/mailer'
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

  it('con `contains` y `text` filtra por el asunto y por el texto plano, y cuenta los que lo cumplen', async () => {
    const t = await makeApp()
    const mailer = t.app.email.mailer as Mailer
    for (const [id, subject, text] of [
      ['1', 'Tu T2 de 2035 en cifras', 'Temporada T2 de 2035 · cerrada'],
      ['2', 'Logro desbloqueado: Campeón', 'TU PROGRESO DEL LUNES 2 DE JULIO'],
      ['3', 'Tu T2 de 2035 en cifras', 'Temporada T2 de 2035 · cerrada'],
    ] as const)
      await mailer.send({ id, to: 'aina@example.com', subject, text, html: `<p>${text}</p>` })
    const mailbox = async (query: string) =>
      (await t.app.inject({ method: 'GET', url: `/api/test/mailbox?to=aina@example.com${query}` })).json()
        .data
    expect(await mailbox('&contains=en%20cifras')).toMatchObject({
      subject: 'Tu T2 de 2035 en cifras',
      count: 2,
    })
    expect(await mailbox('&text=tu%20progreso%20del')).toEqual({
      subject: 'Logro desbloqueado: Campeón',
      text: 'TU PROGRESO DEL LUNES 2 DE JULIO',
      html: '<p>TU PROGRESO DEL LUNES 2 DE JULIO</p>',
      count: 1,
    })
    expect(await mailbox('&contains=Logro&text=cerrada')).toBeNull()
    expect(await mailbox('')).toMatchObject({ count: 3 })
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
