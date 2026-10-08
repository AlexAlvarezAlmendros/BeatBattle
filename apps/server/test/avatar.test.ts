import { describe, expect, it } from 'vitest'
import type { ImageInfo, ImageStorage } from '../src/modules/storage/cloudinary'
import { createAccount, makeApp, ORIGIN, type TestApp } from './helpers'

/** Cloudinary de mentira: lo «subido» es lo que el test pone en `uploaded`. */
function fakeImages() {
  const uploaded = new Map<string, ImageInfo>()
  const removed: string[] = []
  const images: ImageStorage = {
    prefix: 'beatbattle-test',
    signImageUpload: ({ publicId, nowMs, tags }) => ({
      uploadUrl: 'https://api.cloudinary.com/v1_1/demo/image/upload',
      publicId,
      fields: {
        public_id: publicId,
        timestamp: String(Math.floor(nowMs / 1000)),
        tags: tags.join(','),
        signature: 'x',
      },
    }),
    verifyImage: async (publicId) => uploaded.get(publicId) ?? null,
    imageUrl: (publicId, { size }) =>
      `https://res.cloudinary.com/demo/image/upload/c_fill,g_auto,w_${size},h_${size}/f_auto,q_auto/${publicId}`,
    removeImage: async (publicId) => {
      removed.push(publicId)
    },
  }
  const upload = (publicId: string, format = 'png') =>
    uploaded.set(publicId, { publicId, format, width: 1024, height: 1024, bytes: 200_000, version: 1 })
  return { images, upload, removed }
}

const sign = (
  t: TestApp,
  cookie: string,
  payload: object = { kind: 'avatar', mime: 'image/png', bytes: 3_000_000 },
) => t.app.inject({ method: 'POST', url: '/api/uploads/sign', headers: { cookie, origin: ORIGIN }, payload })
const confirm = (t: TestApp, cookie: string, publicId: string) =>
  t.app.inject({
    method: 'PUT',
    url: '/api/me/avatar',
    headers: { cookie, origin: ORIGIN },
    payload: { publicId },
  })

describe('avatar (RF-PRF-02)', () => {
  it('RF-PRF-02: la firma fija el public_id en la carpeta de la cuenta; al confirmar, el perfil entrega 256 px cuadrado', async () => {
    const fake = fakeImages()
    const t = await makeApp({ images: fake.images })
    const { id, cookie } = await createAccount(t, { email: 'aina@example.com', username: 'aina' })
    const signed = await sign(t, cookie)
    expect(signed.statusCode).toBe(200)
    const { publicId, fields } = signed.json().data
    expect(publicId).toMatch(new RegExp(`^beatbattle-test/avatars/${id}/[0-9a-f-]+$`))
    expect(fields.tags).toBe('avatar')
    fake.upload(publicId)
    const res = await confirm(t, cookie, publicId)
    expect(res.statusCode).toBe(200)
    expect(res.json().data.avatarUrl).toContain(`c_fill,g_auto,w_256,h_256/f_auto,q_auto/${publicId}`)
    expect((await t.app.inject({ method: 'GET', url: '/api/profiles/aina' })).json().data.avatarUrl).toBe(
      res.json().data.avatarUrl,
    )
    // El HUD lo pide a 64 px (§3.4.1).
    const me = await t.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    expect(me.json().data.avatarUrl).toContain(`w_64,h_64/f_auto,q_auto/${publicId}`)
    // Uno nuevo sustituye al anterior, que se borra de Cloudinary.
    const second = (await sign(t, cookie)).json().data.publicId
    fake.upload(second)
    await confirm(t, cookie, second)
    expect(fake.removed).toEqual([publicId])
    // Quitarlo vuelve al monograma.
    const removed = await t.app.inject({
      method: 'DELETE',
      url: '/api/me/avatar',
      headers: { cookie, origin: ORIGIN },
    })
    expect(removed.json().data.avatarUrl).toBeNull()
    expect(fake.removed).toEqual([publicId, second])
  })

  it('RNF-SEC-03: no se puede poner como avatar una imagen de otra carpeta ni una que no se ha subido', async () => {
    const fake = fakeImages()
    const t = await makeApp({ images: fake.images })
    const a = await createAccount(t, { email: 'aina@example.com', username: 'aina' })
    const b = await createAccount(t, { email: 'bru@example.com', username: 'bru' })
    const ofB = (await sign(t, b.cookie)).json().data.publicId
    fake.upload(ofB)
    expect((await confirm(t, a.cookie, ofB)).statusCode).toBe(403)
    expect((await confirm(t, a.cookie, 'beatbattle-test/samples/x/cover')).statusCode).toBe(403)
    expect((await confirm(t, a.cookie, `beatbattle-test/avatars/${a.id}/../${b.id}/x`)).statusCode).toBe(403)
    const notUploaded = (await sign(t, a.cookie)).json().data.publicId
    expect((await confirm(t, a.cookie, notUploaded)).statusCode).toBe(404)
  })

  it('RF-AUTH-01 / RNF-SEC-02: firmar pide email verificado, tipo y tamaño válidos, y 10 por hora', async () => {
    const fake = fakeImages()
    const t = await makeApp({ images: fake.images })
    const unverified = await createAccount(t, {
      email: 'nueva@example.com',
      username: 'nueva',
      verify: false,
    })
    expect((await sign(t, unverified.cookie)).json().error.code).toBe('EMAIL_NOT_VERIFIED')
    const { cookie } = await createAccount(t, { email: 'aina@example.com', username: 'aina' })
    expect((await sign(t, cookie, { kind: 'avatar', mime: 'image/gif', bytes: 1000 })).statusCode).toBe(422)
    expect(
      (await sign(t, cookie, { kind: 'avatar', mime: 'image/png', bytes: 11 * 1024 * 1024 })).statusCode,
    ).toBe(422)
    for (let i = 0; i < 10; i++) expect((await sign(t, cookie)).statusCode).toBe(200)
    expect((await sign(t, cookie)).statusCode).toBe(429)
  })

  it('sin Cloudinary configurado, firmar responde 503 y ningún perfil tiene avatar', async () => {
    const t = await makeApp()
    const { cookie } = await createAccount(t, { email: 'aina@example.com', username: 'aina' })
    expect((await sign(t, cookie)).statusCode).toBe(503)
    expect(
      (await t.app.inject({ method: 'GET', url: '/api/profiles/aina' })).json().data.avatarUrl,
    ).toBeNull()
  })
})
