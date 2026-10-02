import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDb, type Db } from '../src/db/client'
import { runMigrations } from '../src/db/migrate'
import { createTestDb } from '../src/db/testDb'
import { AppError } from '../src/lib/errors'
import {
  enforceRateLimit,
  purgeExpiredRateLimits,
  type RateLimitInput,
  rateLimit,
} from '../src/modules/rateLimit/service'
import { T0 } from './helpers'

const MIN = 60_000
let db: Db
beforeEach(async () => {
  db = await createTestDb()
})

const rule = (now: number, over: Partial<RateLimitInput> = {}): RateLimitInput => ({
  key: 'test:user:1',
  limit: 3,
  windowMs: MIN,
  now,
  ...over,
})

describe('rateLimit (contadores en BD, base de los límites de §4.13)', () => {
  it('permite hasta el límite dentro de la ventana y luego rechaza', async () => {
    const results = []
    for (let i = 0; i < 5; i++) results.push(await rateLimit(db, rule(T0 + i * 1_000)))
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false, false])
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0, 0])
    // la ventana la abre el primer intento y no se alarga con los siguientes
    for (const r of results) expect(r.resetAt).toBe(T0 + MIN)
  })

  it('reinicia la ventana justo al llegar a resetAt', async () => {
    for (let i = 0; i < 4; i++) await rateLimit(db, rule(T0))
    expect((await rateLimit(db, rule(T0 + MIN - 1))).allowed).toBe(false)
    const fresh = await rateLimit(db, rule(T0 + MIN))
    expect(fresh).toEqual({ allowed: true, remaining: 2, resetAt: T0 + 2 * MIN })
  })

  it('cada clave lleva su propio contador', async () => {
    for (let i = 0; i < 3; i++) await rateLimit(db, rule(T0))
    expect((await rateLimit(db, rule(T0))).allowed).toBe(false)
    expect((await rateLimit(db, rule(T0, { key: 'test:user:2' }))).allowed).toBe(true)
  })

  it('llamadas concurrentes nunca superan el límite', async () => {
    const limit = 10
    const results = await Promise.all(
      Array.from({ length: 60 }, () => rateLimit(db, rule(T0, { limit, key: 'burst' }))),
    )
    expect(results.filter((r) => r.allowed)).toHaveLength(limit)
    const row = await db.$client.execute("SELECT count FROM app_rate_limit WHERE key = 'burst'")
    expect(Number(row.rows[0]!.count)).toBe(60)
  })

  it('llamadas concurrentes desde dos clientes de la misma BD tampoco lo superan', async () => {
    // dos conexiones a un mismo fichero simulan dos instancias serverless
    const dir = mkdtempSync(join(tmpdir(), 'bb-rl-'))
    const url = `file:${join(dir, 'rl.db')}`
    const a = await createDb(url)
    const b = await createDb(url)
    try {
      await runMigrations(a)
      const results = await Promise.all(
        Array.from({ length: 40 }, (_, i) => rateLimit(i % 2 ? a : b, rule(T0, { limit: 7, key: 'shared' }))),
      )
      expect(results.filter((r) => r.allowed)).toHaveLength(7)
    } finally {
      a.$client.close()
      b.$client.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('cada intento es una sola sentencia INSERT … ON CONFLICT … DO UPDATE … RETURNING', async () => {
    const spy = vi.spyOn(db.$client, 'execute')
    await rateLimit(db, rule(T0))
    expect(spy).toHaveBeenCalledTimes(1)
    const stmt = spy.mock.calls[0]![0] as unknown as string | { sql: string }
    const text = (typeof stmt === 'string' ? stmt : stmt.sql).toLowerCase()
    expect(text).toMatch(/^insert into .*on conflict .*do update set .*returning/s)
    spy.mockRestore()
  })

  it('valida la entrada (errores de programación)', async () => {
    await expect(rateLimit(db, rule(T0, { key: '' }))).rejects.toThrow(TypeError)
    await expect(rateLimit(db, rule(T0, { limit: 0 }))).rejects.toThrow(RangeError)
    await expect(rateLimit(db, rule(T0, { windowMs: 0.5 }))).rejects.toThrow(RangeError)
    await expect(rateLimit(db, rule(-1))).rejects.toThrow(RangeError)
  })
})

describe('enforceRateLimit', () => {
  it('lanza 429 RATE_LIMITED con Retry-After hasta el fin de la ventana', async () => {
    for (let i = 0; i < 3; i++) await enforceRateLimit(db, rule(T0))
    const err = await enforceRateLimit(db, rule(T0 + 15_500)).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AppError)
    expect(err).toMatchObject({ code: 'RATE_LIMITED', status: 429 })
    // quedan 44,5 s → 45 s
    expect((err as AppError).headers['Retry-After']).toBe('45')
  })

  it('devuelve el resultado si cabe', async () => {
    await expect(enforceRateLimit(db, rule(T0))).resolves.toEqual({
      allowed: true,
      remaining: 2,
      resetAt: T0 + MIN,
    })
  })
})

describe('purgeExpiredRateLimits', () => {
  it('borra solo los contadores con la ventana cerrada', async () => {
    await rateLimit(db, rule(T0, { key: 'viejo', windowMs: MIN }))
    await rateLimit(db, rule(T0, { key: 'vigente', windowMs: 10 * MIN }))
    expect(await purgeExpiredRateLimits(db, T0 + MIN)).toBe(1)
    const rows = await db.$client.execute('SELECT key FROM app_rate_limit')
    expect(rows.rows.map((r) => r.key)).toEqual(['vigente'])
  })
})
