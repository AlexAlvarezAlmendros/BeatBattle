import { errorEnvelopeSchema } from '@beatbattle/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { AppError, conflict, notFound, rateLimited } from '../src/lib/errors'
import { validate } from '../src/lib/validate'
import { makeApp, ORIGIN, type TestApp } from './helpers'

let t: TestApp
afterEach(async () => {
  await t.app.close()
})

const json = { origin: ORIGIN, 'content-type': 'application/json' }

async function appWithRoutes() {
  t = await makeApp({
    logLevel: 'info',
    routes: (app) => {
      app.get('/api/test/app-error', async () => {
        throw conflict('Ya existe.', { field: 'slug' })
      })
      app.get('/api/test/not-found', async () => {
        throw notFound()
      })
      app.get('/api/test/rate', async () => {
        throw rateLimited(2_500)
      })
      app.post('/api/test/zod', async (req) => ({ data: z.object({ n: z.number() }).parse(req.body) }))
      app.post('/api/test/validate', async (req) => ({
        data: validate(z.object({ title: z.string().min(1) }), req.body, 'body'),
      }))
      app.get('/api/test/boom', async () => {
        throw new Error('Failed query: SELECT * FROM user WHERE email = ? params: ana@example.com')
      })
      app.get('/api/test/boom-plain', async () => {
        throw new TypeError('detalle interno que no debe salir')
      })
    },
  })
}

describe('sobre de error { error: { code, message, details? } }', () => {
  it('AppError → su estado, código, mensaje y detalles', async () => {
    await appWithRoutes()
    const res = await t.app.inject({ method: 'GET', url: '/api/test/app-error' })
    expect(res.statusCode).toBe(409)
    expect(res.json()).toEqual({
      error: { code: 'CONFLICT', message: 'Ya existe.', details: { field: 'slug' } },
    })
    expect(errorEnvelopeSchema.safeParse(res.json()).success).toBe(true)
  })

  it('sin detalles, el sobre no lleva la clave details', async () => {
    await appWithRoutes()
    const res = await t.app.inject({ method: 'GET', url: '/api/test/not-found' })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'No encontrado.' } })
  })

  it('429 RATE_LIMITED con Retry-After en segundos', async () => {
    await appWithRoutes()
    const res = await t.app.inject({ method: 'GET', url: '/api/test/rate' })
    expect(res.statusCode).toBe(429)
    expect(res.headers['retry-after']).toBe('3')
    expect(res.json().error.code).toBe('RATE_LIMITED')
  })

  it('ZodError → 422 VALIDATION_FAILED con los problemas en details', async () => {
    await appWithRoutes()
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/test/zod',
      headers: json,
      payload: '{"n":"uno"}',
    })
    expect(res.statusCode).toBe(422)
    const body = res.json()
    expect(body.error.code).toBe('VALIDATION_FAILED')
    expect(body.error.details).toEqual([expect.objectContaining({ path: 'n', message: expect.any(String) })])
  })

  it('validate() antepone la parte de la petición a la ruta del campo', async () => {
    await appWithRoutes()
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/test/validate',
      headers: json,
      payload: '{}',
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().error.details[0].path).toBe('body.title')
  })

  it('JSON mal formado → 400 BAD_REQUEST sin detalles internos', async () => {
    await appWithRoutes()
    const res = await t.app.inject({ method: 'POST', url: '/api/test/zod', headers: json, payload: '{roto' })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: { code: 'BAD_REQUEST', message: 'Petición no válida.' } })
  })

  it('404 de una ruta inexistente con el sobre', async () => {
    await appWithRoutes()
    for (const url of ['/api/no-existe', '/otra-cosa']) {
      const res = await t.app.inject({ method: 'GET', url })
      expect(res.statusCode).toBe(404)
      expect(res.headers['content-type']).toContain('application/json')
      expect(res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'No encontrado.' } })
    }
  })

  it('500 → INTERNAL sin pila ni mensaje interno, con el id de la petición registrado', async () => {
    await appWithRoutes()
    for (const url of ['/api/test/boom', '/api/test/boom-plain']) {
      const res = await t.app.inject({ method: 'GET', url })
      expect(res.statusCode).toBe(500)
      const body = res.json()
      expect(body.error.code).toBe('INTERNAL')
      expect(body.error.message).toBe('Error interno del servidor.')
      expect(res.body).not.toMatch(/Failed query|ana@example|detalle interno|at .*\.ts/)
      const requestId = body.error.details.requestId as string
      expect(requestId).toMatch(/^[0-9a-f-]{36}$/)
      const logged = t.logs.map((l) => JSON.parse(l)).find((l) => l.reqId === requestId && l.level === 50)
      expect(logged?.err?.type).toBeDefined()
    }
    // la consulta y sus parámetros nunca llegan al registro
    expect(t.logs.join('\n')).not.toContain('ana@example.com')
  })

  it('503 SERVICE_UNAVAILABLE en health si la BD no responde', async () => {
    await appWithRoutes()
    t.db.$client.close()
    const res = await t.app.inject({ method: 'GET', url: '/api/health' })
    expect(res.statusCode).toBe(503)
    expect(res.json()).toEqual({
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Servicio no disponible.', details: { db: 'down' } },
    })
  })
})

describe('AppError', () => {
  it('guarda código, estado, detalles y cabeceras', () => {
    const e = new AppError('FORBIDDEN', 403, 'No.', { a: 1 }, { headers: { 'X-Test': '1' } })
    expect(e).toBeInstanceOf(Error)
    expect(e).toMatchObject({ code: 'FORBIDDEN', status: 403, message: 'No.', details: { a: 1 } })
    expect(e.headers).toEqual({ 'X-Test': '1' })
  })

  it('Retry-After es al menos 1 segundo', () => {
    expect(rateLimited(10).headers['Retry-After']).toBe('1')
    expect(rateLimited(60_000).headers['Retry-After']).toBe('60')
  })
})
