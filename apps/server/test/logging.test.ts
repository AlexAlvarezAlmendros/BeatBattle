import { afterEach, describe, expect, it } from 'vitest'
import { safeError } from '../src/lib/logger'
import { makeApp, ORIGIN, type TestApp } from './helpers'

let t: TestApp
afterEach(async () => {
  await t.app.close()
})

describe('registro sin PII (guía §4.13)', () => {
  it('no registra cookies, Authorization, cuerpos, consultas ni IP', async () => {
    t = await makeApp({
      logLevel: 'trace',
      routes: (app) => {
        app.post('/api/test/echo', async (req) => {
          // un registro manual descuidado con las cabeceras también sale redactado
          req.log.info({ headers: req.headers }, 'cabeceras')
          return { data: true }
        })
      },
    })
    await t.app.inject({
      method: 'POST',
      url: '/api/test/echo?token=token-de-baja-secreto',
      remoteAddress: '203.0.113.77',
      headers: {
        origin: ORIGIN,
        'content-type': 'application/json',
        cookie: 'bb.session_token=cookie-secreta',
        authorization: 'Bearer cabecera-secreta',
      },
      payload: JSON.stringify({ password: 'contraseña-secreta', email: 'ana@example.com' }),
    })
    const out = t.logs.join('\n')
    expect(t.logs.length).toBeGreaterThan(0)
    for (const secret of [
      'cookie-secreta',
      'cabecera-secreta',
      'contraseña-secreta',
      'ana@example.com',
      'token-de-baja-secreto',
      '203.0.113.77',
    ])
      expect(out).not.toContain(secret)
    // sí queda lo útil: método, ruta, estado e id de petición
    const lines = t.logs.map((l) => JSON.parse(l))
    expect(lines.some((l) => l.req?.method === 'POST' && l.req?.url === '/api/test/echo')).toBe(true)
    expect(lines.some((l) => l.res?.statusCode === 200 && typeof l.reqId === 'string')).toBe(true)
    expect(out).toContain('[redactado]')
  })

  it('el nivel es configurable: con «warn» no se registran las peticiones normales', async () => {
    t = await makeApp({ logLevel: 'warn' })
    await t.app.inject({ method: 'GET', url: '/api/health' })
    expect(t.logs).toEqual([])
  })
})

describe('safeError', () => {
  it('quita la consulta y los parámetros de los errores de BD', () => {
    const e = Object.assign(new Error('Failed query: INSERT INTO x VALUES (?) params: secreto'), {
      code: 'SQLITE_CONSTRAINT',
    })
    const s = safeError(e)
    expect(s.message).toBe('Fallo en una consulta a la base de datos')
    expect(s.code).toBe('SQLITE_CONSTRAINT')
    expect(JSON.stringify(s)).not.toContain('secreto')
  })

  it('deja el mensaje de los errores normales y solo los marcos de la pila', () => {
    const s = safeError(new TypeError('algo raro'))
    expect(s.type).toBe('TypeError')
    expect(s.message).toBe('algo raro')
    expect(s.stack.split('\n').every((l) => /^\s+at /.test(l))).toBe(true)
  })

  it('tolera valores que no son Error', () => {
    expect(safeError('texto')).toEqual({ type: 'string', message: '', stack: '' })
  })
})
