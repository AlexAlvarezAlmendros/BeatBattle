import { describe, expect, it } from 'vitest'
import {
  CLIENT_ERROR_CODES,
  ERROR_CODES,
  ERROR_STATUS,
  errorCodeSchema,
  isErrorCode,
  isServerErrorCode,
  SERVER_ERROR_CODES,
  validationIssueSchema,
} from '../src/errorCodes'

describe('catálogo de códigos de error', () => {
  it('incluye los códigos base de la Fase 0 con su estado HTTP', () => {
    expect(ERROR_STATUS).toMatchObject({
      VALIDATION_FAILED: 422,
      NOT_FOUND: 404,
      UNAUTHORIZED: 401,
      FORBIDDEN: 403,
      FORBIDDEN_ORIGIN: 403,
      UNSUPPORTED_MEDIA_TYPE: 415,
      PAYLOAD_TOO_LARGE: 413,
      RATE_LIMITED: 429,
      CONFLICT: 409,
      INTERNAL: 500,
    })
  })

  it('RF-ENT-03: el audio de una entrada que no vale se rechaza con su motivo (422)', () => {
    expect(ERROR_STATUS).toMatchObject({
      UNSUPPORTED_FORMAT: 422,
      FILE_TOO_LARGE: 422,
      DURATION_OUT_OF_RANGE: 422,
    })
  })

  it('los códigos son constantes en MAYÚSCULAS y sin repetir', () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length)
    for (const code of ERROR_CODES) expect(code).toMatch(/^[A-Z][A-Z0-9_]*$/)
  })

  it('los estados del servidor son errores HTTP (4xx o 5xx)', () => {
    for (const code of SERVER_ERROR_CODES) {
      expect(ERROR_STATUS[code]).toBeGreaterThanOrEqual(400)
      expect(ERROR_STATUS[code]).toBeLessThan(600)
    }
  })

  it('los códigos del cliente no se mezclan con los del servidor', () => {
    for (const code of CLIENT_ERROR_CODES) {
      expect(isServerErrorCode(code)).toBe(false)
      expect(isErrorCode(code)).toBe(true)
    }
  })

  it('distingue códigos conocidos de cualquier otra cosa', () => {
    expect(isErrorCode('NOT_FOUND')).toBe(true)
    expect(isErrorCode('not_found')).toBe(false)
    expect(isErrorCode('toString')).toBe(false)
    expect(isErrorCode(404)).toBe(false)
    expect(errorCodeSchema.safeParse('RATE_LIMITED').success).toBe(true)
    expect(errorCodeSchema.safeParse('NOPE').success).toBe(false)
  })

  it('el detalle de validación lleva ruta y mensaje', () => {
    expect(validationIssueSchema.parse({ path: 'body.title', message: 'Obligatorio' })).toEqual({
      path: 'body.title',
      message: 'Obligatorio',
    })
    expect(validationIssueSchema.safeParse({ message: 'sin ruta' }).success).toBe(false)
  })
})
