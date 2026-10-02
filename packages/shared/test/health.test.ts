import { describe, expect, it } from 'vitest'
import { healthResponseSchema, healthSchema } from '../src/health'
import * as shared from '../src/index'

describe('esquema de GET /api/health', () => {
  it('acepta el sobre { data: { status, db, time } }', () => {
    const body = { data: { status: 'ok', db: 'up', time: 1_790_000_000_000 } }
    expect(healthResponseSchema.parse(body)).toEqual(body)
  })

  it('rechaza estados desconocidos o instantes no enteros', () => {
    expect(healthSchema.safeParse({ status: 'ko', db: 'up', time: 1 }).success).toBe(false)
    expect(healthSchema.safeParse({ status: 'ok', db: 'down', time: 1 }).success).toBe(false)
    expect(healthSchema.safeParse({ status: 'ok', db: 'up', time: 1.5 }).success).toBe(false)
    expect(healthSchema.safeParse({ status: 'ok', db: 'up', time: '2026-10-02' }).success).toBe(false)
  })

  it('el índice del paquete exporta el sobre, los códigos y el esquema de salud', () => {
    expect(shared.errorEnvelopeSchema).toBeDefined()
    expect(shared.dataEnvelopeSchema).toBeDefined()
    expect(shared.ERROR_STATUS.NOT_FOUND).toBe(404)
    expect(shared.healthSchema).toBe(healthSchema)
  })
})
