import { ERROR_STATUS, type ServerErrorCode, type ValidationIssue } from '@beatbattle/shared'
import type { ZodError } from 'zod'

/**
 * Error de dominio con código estable del catálogo (`@beatbattle/shared`) y estado HTTP. El
 * manejador de `plugins/errors.ts` lo convierte en el sobre `{ error: { code, message, details? } }`.
 * `message` es para depurar (castellano, sin datos internos); la UI traduce por `code`. Con estado
 * ≥ 500, el manejador registra `cause` (el error original), que nunca llega al cliente.
 */
export class AppError extends Error {
  readonly headers: Readonly<Record<string, string>>

  constructor(
    readonly code: ServerErrorCode,
    readonly status: number,
    message: string,
    readonly details?: unknown,
    options: { headers?: Record<string, string>; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'AppError'
    this.headers = options.headers ?? {}
  }
}

/** Crea un `AppError` con el estado por defecto del código. */
export function appError(code: ServerErrorCode, message: string, details?: unknown): AppError {
  return new AppError(code, ERROR_STATUS[code], message, details)
}

export const badRequest = (message = 'Petición no válida.', details?: unknown) =>
  appError('BAD_REQUEST', message, details)
export const unauthorized = (message = 'Inicia sesión para continuar.') => appError('UNAUTHORIZED', message)
export const forbidden = (message = 'No tienes permiso para hacer esto.') => appError('FORBIDDEN', message)
export const notFound = (message = 'No encontrado.') => appError('NOT_FOUND', message)
export const conflict = (message: string, details?: unknown) => appError('CONFLICT', message, details)
export const validationFailed = (issues: ValidationIssue[], message = 'Datos no válidos.') =>
  appError('VALIDATION_FAILED', message, issues)

/** 429 con `Retry-After` en segundos (mínimo 1). */
export function rateLimited(retryAfterMs: number, details?: unknown): AppError {
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000))
  return new AppError(
    'RATE_LIMITED',
    ERROR_STATUS.RATE_LIMITED,
    'Demasiadas peticiones. Espera un poco antes de volver a probar.',
    details,
    { headers: { 'Retry-After': String(seconds) } },
  )
}

/** Problemas de un `ZodError` en el formato de `details` de `VALIDATION_FAILED`. */
export function zodIssues(error: ZodError, prefix?: string): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: [prefix, ...issue.path.map(String)].filter(Boolean).join('.'),
    message: issue.message,
    code: issue.code,
  }))
}
