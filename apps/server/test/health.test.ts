import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'

describe('GET /api/health', () => {
  it('responde 200 con el sobre { data }', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ data: { status: 'ok' } })
    await app.close()
  })
})
