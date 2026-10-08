import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { EnvError, loadEnv } from '../src/config/env'
import { createCloudinaryStorage, STREAM_TRANSFORMATION } from '../src/modules/storage/cloudinary'
import { makeApp, ORIGIN, T0 } from './helpers'

const CONFIG = {
  cloudName: 'bb-test',
  apiKey: '123456789',
  apiSecret: 'secreto-de-prueba',
  prefix: 'beatbattle-dev',
}
const CREDS = { CLOUDINARY_CLOUD_NAME: 'bb-test', CLOUDINARY_API_KEY: '1', CLOUDINARY_API_SECRET: 'x' }

describe('configuración de Cloudinary (§4.8.1)', () => {
  it('RF-STO-06: «beatbattle» fuera de producción impide arrancar; también en una preview de Vercel', () => {
    expect(() => loadEnv({ BB_CLOUDINARY_PREFIX: 'beatbattle' })).toThrow(EnvError)
    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        VERCEL_ENV: 'preview',
        BB_PUBLIC_URL: 'https://x.example',
        BB_CLOUDINARY_PREFIX: 'beatbattle',
      }),
    ).toThrow(/RF-STO-06/)
    const prod = loadEnv({
      NODE_ENV: 'production',
      VERCEL_ENV: 'production',
      BB_PUBLIC_URL: 'https://battle.otherpeople.es',
      BB_CLOUDINARY_PREFIX: 'beatbattle',
      ...CREDS,
      BETTER_AUTH_SECRET: 'x'.repeat(40),
    })
    expect(prod.storage?.prefix).toBe('beatbattle')
  })

  it('RF-STO-06: por defecto, beatbattle-dev; sin credenciales, sin almacenamiento; las tres van juntas', () => {
    expect(loadEnv({}).storage).toBeNull()
    expect(loadEnv(CREDS).storage).toEqual({
      cloudName: 'bb-test',
      apiKey: '1',
      apiSecret: 'x',
      prefix: 'beatbattle-dev',
    })
    expect(() => loadEnv({ CLOUDINARY_CLOUD_NAME: 'bb-test' })).toThrow(/van juntas/)
  })
})

describe('Cloudinary: firma y entrega (§4.8.2, §4.8.3)', () => {
  const storage = createCloudinaryStorage(CONFIG)

  it('RF-STO-01: la subida firmada fija public_id, authenticated y el derivado de escucha; la firma es la de Cloudinary', () => {
    const upload = storage.signUpload({ publicId: 'beatbattle-dev/spike/abc', nowMs: T0 })
    expect(upload.uploadUrl).toBe('https://api.cloudinary.com/v1_1/bb-test/video/upload')
    const { signature, api_key, ...signed } = upload.fields
    expect(api_key).toBe('123456789')
    expect(signed).toMatchObject({
      public_id: 'beatbattle-dev/spike/abc',
      type: 'authenticated',
      eager: 'f_mp3,br_192k',
      eager_async: 'true',
      timestamp: String(T0 / 1000),
    })
    // Firma de Cloudinary: SHA-1 de los parámetros ordenados («a=1&b=2») seguidos del secreto.
    const toSign = Object.keys(signed)
      .sort()
      .map((key) => `${key}=${signed[key]}`)
      .join('&')
    expect(signature).toBe(
      createHash('sha1')
        .update(toSign + CONFIG.apiSecret)
        .digest('hex'),
    )
  })

  it('RF-STO-02: la escucha es una URL firmada del derivado MP3 a 192 kb/s; el original sin firma, sin `s--`', () => {
    const url = storage.streamUrl('beatbattle-dev/spike/abc')
    expect(url).toMatch(
      /^https:\/\/res\.cloudinary\.com\/bb-test\/video\/authenticated\/s--[\w-]{8}--\/f_mp3,br_192k\/(v1\/)?beatbattle-dev\/spike\/abc\.mp3$/,
    )
    expect(url).toContain(STREAM_TRANSFORMATION)
    expect(storage.unsignedOriginalUrl('beatbattle-dev/spike/abc')).not.toContain('s--')
  })
})

describe('rutas del spike (tarea 1.7)', () => {
  it('sin credenciales, 503 con el motivo', async () => {
    const { app } = await makeApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/dev/storage/uploads',
      headers: { origin: ORIGIN },
    })
    expect(res.statusCode).toBe(503)
    expect(res.json().error.code).toBe('SERVICE_UNAVAILABLE')
  })

  it('RF-ENT-04: la subida va a <prefijo>/spike/<uuid>, sin ningún id de usuario', async () => {
    const { app } = await makeApp({ config: { storage: CONFIG } })
    const res = await app.inject({
      method: 'POST',
      url: '/api/dev/storage/uploads',
      headers: { origin: ORIGIN },
    })
    expect(res.statusCode).toBe(200)
    const { id, publicId } = res.json().data
    expect(publicId).toBe(`beatbattle-dev/spike/${id}`)
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('en producción no existen', async () => {
    const { app } = await makeApp({ config: { env: 'production', storage: CONFIG } })
    const res = await app.inject({
      method: 'POST',
      url: '/api/dev/storage/uploads',
      headers: { origin: ORIGIN },
    })
    expect(res.statusCode).toBe(404)
  })

  it('un id que no es un uuid no llega a Cloudinary (422)', async () => {
    const { app } = await makeApp({ config: { storage: CONFIG } })
    const res = await app.inject({ method: 'GET', url: '/api/dev/storage/resources/../../otra-carpeta' })
    expect([404, 422]).toContain(res.statusCode)
    const bad = await app.inject({ method: 'GET', url: '/api/dev/storage/resources/no-es-uuid/stream' })
    expect(bad.statusCode).toBe(422)
  })
})
