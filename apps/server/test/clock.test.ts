import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { EnvError } from '../src/config/env'
import { createTestDb } from '../src/db/testDb'
import { fixedClock, parseTestNow, systemClock, TEST_NOW_HEADER } from '../src/lib/clock'
import { makeApp, T0, type TestApp, testConfig } from './helpers'

describe('Clock', () => {
  it('el reloj del sistema da ms Unix', () => {
    const before = Date.now()
    const t = systemClock.now()
    expect(t).toBeGreaterThanOrEqual(before)
    expect(Number.isInteger(t)).toBe(true)
  })

  it('el reloj fijo solo se mueve cuando se le pide', () => {
    const c = fixedClock(T0)
    expect(c.now()).toBe(T0)
    expect(c.now()).toBe(T0)
    c.advance(1500)
    expect(c.now()).toBe(T0 + 1500)
    c.set(42)
    expect(c.now()).toBe(42)
    expect(() => c.set(1.5)).toThrow(RangeError)
    expect(() => fixedClock(-1)).toThrow(RangeError)
  })
})

describe('parseTestNow', () => {
  it('acepta ms Unix', () => {
    expect(parseTestNow('1790000000000')).toBe(1_790_000_000_000)
    expect(parseTestNow(' 0 ')).toBe(0)
  })

  it('acepta ISO 8601 con zona (Z u offset)', () => {
    expect(parseTestNow('2026-10-05T10:00:00Z')).toBe(T0)
    expect(parseTestNow('2026-10-05T12:00:00+02:00')).toBe(T0)
    expect(parseTestNow('2026-10-05T10:00:00.250Z')).toBe(T0 + 250)
    expect(parseTestNow('2026-10-05T10:00Z')).toBe(T0)
  })

  it('rechaza fechas sin zona, imposibles o basura', () => {
    expect(parseTestNow('2026-10-05T10:00:00')).toBeNull()
    expect(parseTestNow('2026-10-05')).toBeNull()
    expect(parseTestNow('2026-13-45T99:00:00Z')).toBeNull()
    expect(parseTestNow('mañana')).toBeNull()
    expect(parseTestNow('-5')).toBeNull()
    expect(parseTestNow('99999999999999999999')).toBeNull()
  })
})

describe('request.now y la cabecera x-bb-test-now (guía §4.12)', () => {
  let t: TestApp
  afterEach(async () => {
    await t.app.close()
  })

  const timeOf = async (headers: Record<string, string> = {}) => {
    const res = await t.app.inject({ method: 'GET', url: '/api/health', headers })
    return { status: res.statusCode, body: res.json() }
  }

  it('sin cabecera, request.now es el reloj inyectado', async () => {
    t = await makeApp({ config: { testClock: true } })
    expect((await timeOf()).body.data.time).toBe(T0)
    t.clock.advance(60_000)
    expect((await timeOf()).body.data.time).toBe(T0 + 60_000)
  })

  it('con BB_TEST_CLOCK=1, la cabecera fija request.now (ms o ISO)', async () => {
    t = await makeApp({ config: { testClock: true } })
    expect((await timeOf({ [TEST_NOW_HEADER]: '1800000000000' })).body.data.time).toBe(1_800_000_000_000)
    expect((await timeOf({ [TEST_NOW_HEADER]: '2026-10-11T23:59:59+02:00' })).body.data.time).toBe(
      Date.UTC(2026, 9, 11, 21, 59, 59),
    )
  })

  it('con BB_TEST_CLOCK=1, una cabecera mal formada da 422 VALIDATION_FAILED', async () => {
    t = await makeApp({ config: { testClock: true } })
    const res = await timeOf({ [TEST_NOW_HEADER]: 'el lunes' })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('VALIDATION_FAILED')
    expect(res.body.error.details[0].path).toBe(`headers.${TEST_NOW_HEADER}`)
  })

  it('sin la guarda, la cabecera se ignora por completo (también si es basura)', async () => {
    t = await makeApp({ config: { testClock: false } })
    expect((await timeOf({ [TEST_NOW_HEADER]: '1800000000000' })).body.data.time).toBe(T0)
    const res = await timeOf({ [TEST_NOW_HEADER]: 'el lunes' })
    expect(res.status).toBe(200)
    expect(res.body.data.time).toBe(T0)
  })
})

describe('guarda §4.12 al montar la app', () => {
  it('una configuración de producción con el reloj de prueba no monta la app, aunque no venga de loadEnv', async () => {
    const db = await createTestDb()
    const build = () =>
      buildApp({ config: testConfig({ env: 'production', testClock: true }), db, clock: fixedClock(T0) })
    expect(build).toThrow(EnvError)
    expect(build).toThrow(/BB_TEST_CLOCK/)
    // producción sin el reloj de prueba sí se monta
    const app = buildApp({ config: testConfig({ env: 'production', testClock: false }), db })
    await app.ready()
    await app.close()
    db.$client.close()
  })
})
