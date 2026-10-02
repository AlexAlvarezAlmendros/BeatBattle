import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { BODY_LIMIT_BYTES } from '../src/plugins/security'
import { makeApp, ORIGIN, type TestApp } from './helpers'

let t: TestApp
beforeEach(async () => {
  t = await makeApp({
    routes: (app) => {
      // escritura de prueba: devuelve lo que recibe
      app.post('/api/test/echo', async (req) => ({ data: z.object({ n: z.number() }).parse(req.body) }))
      app.delete('/api/test/thing', async () => ({ data: { deleted: true } }))
    },
  })
})
afterEach(async () => {
  await t.app.close()
})

const post = (headers: Record<string, string>, payload: string) =>
  t.app.inject({ method: 'POST', url: '/api/test/echo', headers, payload })

describe('comprobación de Origin en escrituras', () => {
  it('RNF-SEC-05: Origin ajeno → 403 FORBIDDEN_ORIGIN', async () => {
    const res = await post({ origin: 'https://malo.example', 'content-type': 'application/json' }, '{"n":1}')
    expect(res.statusCode).toBe(403)
    expect(res.json()).toEqual({
      error: { code: 'FORBIDDEN_ORIGIN', message: 'Petición rechazada: origen no permitido.' },
    })
  })

  it('RNF-SEC-05: sin Origin (o «null») → 403', async () => {
    expect((await post({ 'content-type': 'application/json' }, '{"n":1}')).statusCode).toBe(403)
    expect((await post({ origin: 'null', 'content-type': 'application/json' }, '{"n":1}')).statusCode).toBe(
      403,
    )
  })

  it('RNF-SEC-05: también en rutas que no existen y en DELETE sin cuerpo', async () => {
    const missing = await t.app.inject({
      method: 'PUT',
      url: '/api/no-existe',
      headers: { origin: 'https://x.y' },
    })
    expect(missing.statusCode).toBe(403)
    const del = await t.app.inject({
      method: 'DELETE',
      url: '/api/test/thing',
      headers: { origin: 'https://x.y' },
    })
    expect(del.statusCode).toBe(403)
  })

  it('un Origin permitido pasa', async () => {
    const res = await post({ origin: ORIGIN, 'content-type': 'application/json' }, '{"n":1}')
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ data: { n: 1 } })
    const del = await t.app.inject({ method: 'DELETE', url: '/api/test/thing', headers: { origin: ORIGIN } })
    expect(del.statusCode).toBe(200)
  })

  it('las lecturas no necesitan Origin', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { origin: 'https://malo.example' },
    })
    expect(res.statusCode).toBe(200)
  })
})

describe('solo JSON en escrituras', () => {
  it('RNF-SEC-05: text/plain → 415 UNSUPPORTED_MEDIA_TYPE', async () => {
    const res = await post({ origin: ORIGIN, 'content-type': 'text/plain' }, '{"n":1}')
    expect(res.statusCode).toBe(415)
    expect(res.json().error.code).toBe('UNSUPPORTED_MEDIA_TYPE')
  })

  it('RNF-SEC-05: formularios y cuerpos sin tipo → 415', async () => {
    for (const type of ['application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', undefined]) {
      const headers: Record<string, string> = { origin: ORIGIN }
      if (type) headers['content-type'] = type
      const res = await post(headers, 'n=1')
      expect(res.statusCode).toBe(415)
    }
  })

  it('acepta application/json con charset', async () => {
    const res = await post({ origin: ORIGIN, 'content-type': 'application/json; charset=utf-8' }, '{"n":2}')
    expect(res.statusCode).toBe(200)
  })
})

describe('tamaño del cuerpo', () => {
  it('cuerpo > 64 kB → 413 PAYLOAD_TOO_LARGE', async () => {
    const big = JSON.stringify({ n: 1, pad: 'x'.repeat(BODY_LIMIT_BYTES) })
    const res = await post({ origin: ORIGIN, 'content-type': 'application/json' }, big)
    expect(res.statusCode).toBe(413)
    expect(res.json().error.code).toBe('PAYLOAD_TOO_LARGE')
  })

  it('el tope de Fastify es el mismo (cuerpos sin Content-Length)', () => {
    expect(BODY_LIMIT_BYTES).toBe(64 * 1024)
    expect(t.app.initialConfig.bodyLimit).toBe(BODY_LIMIT_BYTES)
  })

  it('un cuerpo justo por debajo del tope pasa', async () => {
    const base = JSON.stringify({ n: 1, pad: '' })
    const ok = JSON.stringify({ n: 1, pad: 'x'.repeat(BODY_LIMIT_BYTES - base.length) })
    expect(Buffer.byteLength(ok)).toBe(BODY_LIMIT_BYTES)
    expect((await post({ origin: ORIGIN, 'content-type': 'application/json' }, ok)).statusCode).toBe(200)
  })
})

describe('cabeceras de seguridad de la API', () => {
  const expectHeaders = (headers: Record<string, unknown>) => {
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['cache-control']).toBe('no-store')
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
  }

  it('RNF-SEC-01: /api/health lleva nosniff, Referrer-Policy, X-Frame-Options y no-store', async () => {
    expectHeaders((await t.app.inject({ method: 'GET', url: '/api/health' })).headers)
  })

  it('RNF-SEC-01: también las respuestas de error (404, 403, 415)', async () => {
    expectHeaders((await t.app.inject({ method: 'GET', url: '/api/nada' })).headers)
    expectHeaders((await post({ origin: 'https://malo.example' }, '{}')).headers)
    expectHeaders((await post({ origin: ORIGIN, 'content-type': 'text/plain' }, 'x')).headers)
  })

  it('una ruta puede fijar su propio Cache-Control', async () => {
    const app = (
      await makeApp({
        routes: (a) =>
          a.get('/api/test/cached', async (_req, reply) =>
            reply.header('Cache-Control', 'public, max-age=60').send({ data: 1 }),
          ),
      })
    ).app
    const res = await app.inject({ method: 'GET', url: '/api/test/cached' })
    expect(res.headers['cache-control']).toBe('public, max-age=60')
    await app.close()
  })
})
