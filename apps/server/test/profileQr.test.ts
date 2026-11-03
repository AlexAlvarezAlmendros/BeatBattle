import { describe, expect, it } from 'vitest'
import { qrPng } from '../src/media/qrPng'
import { PROFILE_QR_CACHE_SECONDS, profilePageUrl } from '../src/modules/profile/routes'
import { createAccount, makeApp, ORIGIN, type TestApp } from './helpers'

const get = (t: TestApp, url: string) => t.app.inject({ method: 'GET', url })

/**
 * El QR del reverso de la carta (guía §3.4.4, §4.10; tarea 7.22): `GET /api/profiles/:username/qr.png`, público, con la
 * matriz de `qrcode` en el servidor (§4.1) y el codificador PNG propio (el del QR del recibo, 4.13). Codifica solo la
 * dirección pública del perfil; sin perfil público, 404.
 */
describe('QR del perfil (§3.4.4, §4.10)', () => {
  it('RF-GAME-07 / RF-PRF-01: el PNG del QR de la página pública del perfil, con caché larga', async () => {
    const t = await makeApp()
    await createAccount(t, { email: 'kairo@example.com', username: 'Kairo.wav' })
    const res = await get(t, '/api/profiles/KAIRO.WAV/qr.png')
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('image/png')
    expect(res.headers['cache-control']).toBe(`public, max-age=${PROFILE_QR_CACHE_SECONDS}`)
    // Lo que codifica es exactamente la dirección pública (`BB_PUBLIC_URL` + `/p/` + el nombre en minúsculas).
    const url = profilePageUrl(t.config.publicUrl, 'kairo.wav')
    expect(url).toBe(`${t.config.publicUrl}/p/kairo.wav`)
    expect(Buffer.from(res.rawPayload).equals(Buffer.from(qrPng(url)))).toBe(true)
  })

  it('RF-PRF-01 / RNF-PRIV-04: sin perfil público (no existe o está suspendida), 404; nada de la cuenta en la respuesta', async () => {
    const t = await makeApp()
    const { id } = await createAccount(t, { email: 'aina@example.com', username: 'aina' })
    const missing = await get(t, '/api/profiles/nadie/qr.png')
    expect(missing.statusCode).toBe(404)
    expect(missing.json().error.code).toBe('NOT_FOUND')
    await t.db.$client.execute({ sql: 'update user set banned = 1 where id = ?', args: [id] })
    const banned = await get(t, '/api/profiles/aina/qr.png')
    expect(banned.statusCode).toBe(404)
    expect(banned.body).not.toMatch(/aina@example\.com|aina/)
  })

  it('RF-PRF-03: el nombre anterior lleva (301) al QR del nombre nuevo', async () => {
    const t = await makeApp()
    const { cookie } = await createAccount(t, { email: 'aina@example.com', username: 'aina' })
    const changed = await t.app.inject({
      method: 'PUT',
      url: '/api/me/username',
      headers: { cookie, origin: ORIGIN },
      payload: { username: 'aina.beats' },
    })
    expect(changed.statusCode).toBe(200)
    const res = await get(t, '/api/profiles/aina/qr.png')
    expect(res.statusCode).toBe(301)
    expect(res.headers.location).toBe('/api/profiles/aina.beats/qr.png')
  })
})
