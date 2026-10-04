import { z } from 'zod'

/**
 * Catálogo de códigos de error de la API (guía §4.10) con su estado HTTP por defecto.
 *
 * Los códigos son estables: la UI los traduce por i18n (`errors.<CÓDIGO>`) y nunca muestra el
 * `message` del servidor tal cual. El catálogo crece por fases: cada fase añade aquí sus códigos de
 * dominio (p. ej. `EMAIL_NOT_VERIFIED`, `LISTEN_REQUIRED`, `VOTING_CLOSED`) junto con sus tests.
 */
export const ERROR_STATUS = {
  /** Petición mal formada (JSON roto, cabecera imposible de interpretar). */
  BAD_REQUEST: 400,
  /** Hace falta sesión. */
  UNAUTHORIZED: 401,
  /** Hay sesión, pero no permiso. */
  FORBIDDEN: 403,
  /** Escritura con `Origin` ausente o fuera de `ALLOWED_ORIGINS` (`RNF-SEC-05`). */
  FORBIDDEN_ORIGIN: 403,
  NOT_FOUND: 404,
  /** El estado actual impide la operación (duplicado, fase cerrada…). */
  CONFLICT: 409,
  /** Cuerpo por encima de 64 kB (el audio nunca pasa por la API). */
  PAYLOAD_TOO_LARGE: 413,
  /** Escritura con un cuerpo que no es `application/json` (`RNF-SEC-05`). */
  UNSUPPORTED_MEDIA_TYPE: 415,
  /** El cuerpo, la consulta o una cabecera no pasan el esquema Zod; `details` lleva los problemas. */
  VALIDATION_FAILED: 422,
  /** Límite de frecuencia superado; la respuesta lleva `Retry-After`. */
  RATE_LIMITED: 429,
  /** Error inesperado; nunca lleva la pila ni mensajes internos. */
  INTERNAL: 500,
  /** Una dependencia imprescindible (la base de datos) no responde. */
  SERVICE_UNAVAILABLE: 503,
} as const satisfies Record<string, number>

export type ServerErrorCode = keyof typeof ERROR_STATUS
export const SERVER_ERROR_CODES = Object.keys(ERROR_STATUS) as ServerErrorCode[]

/**
 * Códigos que solo genera el cliente (`apps/web/src/net`), nunca el servidor:
 * - `NETWORK_ERROR`: no hubo respuesta (sin conexión, DNS, CORS, servidor caído).
 * - `BAD_RESPONSE`: llegó una respuesta que no es el sobre esperado (p. ej. un 502 en HTML del
 *   proxy o datos que no cumplen el esquema).
 */
export const CLIENT_ERROR_CODES = ['NETWORK_ERROR', 'BAD_RESPONSE'] as const
export type ClientErrorCode = (typeof CLIENT_ERROR_CODES)[number]

export type ErrorCode = ServerErrorCode | ClientErrorCode
export const ERROR_CODES: readonly [ErrorCode, ...ErrorCode[]] = [
  ...CLIENT_ERROR_CODES,
  ...SERVER_ERROR_CODES,
]

export const errorCodeSchema = z.enum(ERROR_CODES)

export function isServerErrorCode(value: unknown): value is ServerErrorCode {
  return typeof value === 'string' && Object.hasOwn(ERROR_STATUS, value)
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return isServerErrorCode(value) || (CLIENT_ERROR_CODES as readonly unknown[]).includes(value)
}

/**
 * Elemento de `details` en un `VALIDATION_FAILED`: la ruta del campo (`body.title`,
 * `headers.x-bb-test-now`…) y un mensaje legible para depurar. La UI usa `path` para marcar el campo.
 */
export const validationIssueSchema = z.object({
  path: z.string(),
  message: z.string(),
  code: z.string().optional(),
})
export type ValidationIssue = z.infer<typeof validationIssueSchema>
