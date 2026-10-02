import { healthResponseSchema } from '@beatbattle/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { makeApp, T0, type TestApp } from './helpers'

let t: TestApp
afterEach(async () => {
  await t.app.close()
})

describe('GET /api/health', () => {
  it('responde 200 con el sobre { data: { status, db, time } }', async () => {
    t = await makeApp()
    const res = await t.app.inject({ method: 'GET', url: '/api/health' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('application/json')
    expect(res.json()).toEqual({ data: { status: 'ok', db: 'up', time: T0 } })
    expect(healthResponseSchema.safeParse(res.json()).success).toBe(true)
  })

  it('la hora sale del reloj inyectado', async () => {
    t = await makeApp()
    t.clock.advance(5_000)
    const res = await t.app.inject({ method: 'GET', url: '/api/health' })
    expect(res.json().data.time).toBe(T0 + 5_000)
  })
})
