import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { dataEnvelopeSchema, errorEnvelopeSchema } from '../src/envelope'

describe('sobre de la API', () => {
  it('acepta { data } con el esquema del contenido', () => {
    const schema = dataEnvelopeSchema(z.object({ status: z.literal('ok') }))
    expect(schema.parse({ data: { status: 'ok' } })).toEqual({ data: { status: 'ok' } })
    expect(() => schema.parse({ data: { status: 'ko' } })).toThrow()
  })

  it('acepta { error } con código y mensaje', () => {
    const parsed = errorEnvelopeSchema.parse({ error: { code: 'NOT_FOUND', message: 'No existe' } })
    expect(parsed.error.code).toBe('NOT_FOUND')
    expect(() => errorEnvelopeSchema.parse({ error: { message: 'sin código' } })).toThrow()
  })
})
