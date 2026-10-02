import { ERROR_STATUS, type ErrorEnvelope, type ServerErrorCode } from '@beatbattle/shared'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { ZodError } from 'zod'
import { AppError, zodIssues } from '../lib/errors'

/** Código del catálogo para un estado 4xx genérico que llega de Fastify o de un plugin. */
const CODE_BY_STATUS: Readonly<Record<number, ServerErrorCode>> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'VALIDATION_FAILED',
  429: 'RATE_LIMITED',
}

const GENERIC_MESSAGE: Readonly<Partial<Record<ServerErrorCode, string>>> = {
  BAD_REQUEST: 'Petición no válida.',
  UNAUTHORIZED: 'Inicia sesión para continuar.',
  FORBIDDEN: 'No tienes permiso para hacer esto.',
  NOT_FOUND: 'No encontrado.',
  CONFLICT: 'La operación choca con el estado actual.',
  PAYLOAD_TOO_LARGE: 'La petición es demasiado grande.',
  UNSUPPORTED_MEDIA_TYPE: 'Solo se acepta application/json.',
  VALIDATION_FAILED: 'Datos no válidos.',
  RATE_LIMITED: 'Demasiadas peticiones. Espera un poco antes de volver a probar.',
}

function send(reply: FastifyReply, status: number, error: ErrorEnvelope['error']) {
  const body: ErrorEnvelope = { error }
  return reply.code(status).type('application/json; charset=utf-8').send(body)
}

interface FastifyLikeError {
  statusCode?: unknown
  validation?: unknown
}

/**
 * Manejadores de error y de 404 (guía §4.10). Toda respuesta de error usa el sobre
 * `{ error: { code, message, details? } }`:
 * - `AppError` → su código, estado, detalles y cabeceras (p. ej. `Retry-After`);
 * - `ZodError` → 422 `VALIDATION_FAILED` con los problemas en `details`;
 * - errores de Fastify (tipo de contenido, tamaño, JSON roto…) → su 4xx con un código del catálogo
 *   y un mensaje genérico;
 * - cualquier otra cosa → 500 `INTERNAL` sin pila ni mensaje interno; se registra con el id de la
 *   petición, que también va en `details.requestId` para poder citarlo en un aviso.
 */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((_req, reply) =>
    send(reply, 404, { code: 'NOT_FOUND', message: GENERIC_MESSAGE.NOT_FOUND! }),
  )

  app.setErrorHandler((err: unknown, req, reply) => {
    if (err instanceof AppError) {
      if (err.status >= 500) req.log.error({ err: err.cause ?? err }, err.message)
      reply.headers(err.headers)
      return send(reply, err.status, { code: err.code, message: err.message, details: err.details })
    }
    if (err instanceof ZodError)
      return send(reply, ERROR_STATUS.VALIDATION_FAILED, {
        code: 'VALIDATION_FAILED',
        message: GENERIC_MESSAGE.VALIDATION_FAILED!,
        details: zodIssues(err),
      })

    const fe = (typeof err === 'object' && err !== null ? err : {}) as FastifyLikeError
    if (fe.validation)
      return send(reply, ERROR_STATUS.VALIDATION_FAILED, {
        code: 'VALIDATION_FAILED',
        message: GENERIC_MESSAGE.VALIDATION_FAILED!,
      })
    const status = typeof fe.statusCode === 'number' ? fe.statusCode : 500
    if (status >= 400 && status < 500) {
      const code = CODE_BY_STATUS[status] ?? 'BAD_REQUEST'
      return send(reply, status, { code, message: GENERIC_MESSAGE[code]! })
    }

    req.log.error({ err }, 'Error interno')
    return send(reply, ERROR_STATUS.INTERNAL, {
      code: 'INTERNAL',
      message: 'Error interno del servidor.',
      details: { requestId: req.id },
    })
  })
}
