import type { FastifyServerOptions } from 'fastify'
import type { LogLevel } from '../config/env'

/** Destino del registro (pino escribe una línea JSON por llamada). */
export interface LogStream {
  write(line: string): void
}

/**
 * Serializador de errores para el registro (guía §4.13, «errores de BD sin parámetros»): los
 * errores de Drizzle llevan la consulta y sus parámetros en el mensaje y en propiedades propias;
 * aquí solo queda el tipo, el código y los marcos de la pila. Portado de Orchard.
 */
export function safeError(e: unknown): {
  type: string
  message: string
  stack: string
  [key: string]: unknown
} {
  if (!(e instanceof Error)) return { type: typeof e, message: '', stack: '' }
  const cause = (e as { cause?: { code?: unknown; name?: unknown } }).cause
  const sql = /Failed query|SQLITE_|LIBSQL/i.test(e.message) || 'params' in e || 'query' in e
  return {
    type: e.constructor?.name ?? 'Error',
    message: sql ? 'Fallo en una consulta a la base de datos' : e.message,
    code: (e as { code?: unknown }).code ?? cause?.code,
    cause: cause ? String(cause.name ?? 'Error') : undefined,
    // solo los marcos: el mensaje (que puede ocupar varias líneas) ya va saneado arriba
    stack: (e.stack ?? '')
      .split('\n')
      .filter((l) => /^\s+at /.test(l))
      .join('\n'),
  }
}

/** Ruta sin la cadena de consulta: puede llevar tokens (`/api/unsubscribe?token=…`). */
function pathOnly(url: string | undefined): string | undefined {
  if (!url) return url
  const i = url.indexOf('?')
  return i === -1 ? url : url.slice(0, i)
}

/**
 * Opciones del registro de Fastify (pino) sin datos personales (guía §4.13, §4.14):
 * - de la petición solo se registran el método y la ruta (sin consulta, sin IP, sin cabeceras);
 * - nunca se registran cuerpos (Fastify no lo hace y no se añade);
 * - `authorization`, `cookie` y `set-cookie` se redactan por si algún registro manual las incluye;
 * - los errores pasan por `safeError`.
 */
export function loggerOptions(
  level: LogLevel,
  stream?: LogStream,
): NonNullable<FastifyServerOptions['logger']> {
  return {
    level,
    ...(stream ? { stream } : {}),
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'headers.authorization',
        'headers.cookie',
        'res.headers["set-cookie"]',
      ],
      censor: '[redactado]',
    },
    serializers: {
      req: (req) => ({ method: req.method, url: pathOnly(req.url) }),
      res: (res) => ({ statusCode: res.statusCode }),
      err: safeError,
    },
  }
}
