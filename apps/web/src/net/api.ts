import { type ErrorCode, errorEnvelopeSchema } from '@beatbattle/shared'
import type { z } from 'zod'

/**
 * Cliente de la API tipado (guía §4.7.2). Mismo origen (`/api`; en desarrollo lo reenvía el proxy
 * de Vite), cookies solo del propio sitio y sobre `{ data } | { error }` validado con Zod.
 *
 * Todo fallo llega como `ApiClientError` con un código estable que la UI traduce por i18n:
 * - los del servidor (`NOT_FOUND`, `RATE_LIMITED`…), con su estado HTTP;
 * - `NETWORK_ERROR` (estado 0) si no hubo respuesta;
 * - `BAD_RESPONSE` si la respuesta no es el sobre esperado (un 502 en HTML del proxy, JSON roto o
 *   datos que no cumplen el esquema).
 * Una cancelación (`signal`) se propaga tal cual (`AbortError`), como espera TanStack Query.
 */
export class ApiClientError extends Error {
  /** Segundos que pide esperar un 429 (`Retry-After`), si los indicó. */
  retryAfterSeconds?: number

  constructor(
    /** Código del catálogo de `@beatbattle/shared`; puede ser uno nuevo que este cliente aún no conoce. */
    readonly code: ErrorCode | (string & {}),
    /** Estado HTTP; 0 si no hubo respuesta. */
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiClientError'
  }
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface ApiFetchOptions<T> {
  method?: HttpMethod
  /** Cuerpo JSON (se serializa aquí y añade `Content-Type: application/json`). */
  body?: unknown
  /** Esquema del contenido de `data`; la respuesta se valida antes de devolverla. */
  schema: z.ZodType<T>
  signal?: AbortSignal
}

function isDataEnvelope(value: unknown): value is { data: unknown } {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && 'data' in value
}

function retryAfter(res: Response): number | undefined {
  const seconds = Number(res.headers.get('Retry-After'))
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined
}

/**
 * Llama a la API y devuelve `data` validado. `path` es la ruta completa del servidor
 * (`/api/health`), para que se pueda buscar igual en el cliente y en el servidor.
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions<T>): Promise<T> {
  const { method = 'GET', body, schema, signal } = options
  if (!path.startsWith('/api/')) throw new TypeError(`apiFetch: la ruta debe empezar por /api/ (${path})`)

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let res: Response
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      signal,
    })
  } catch (err) {
    if (signal?.aborted) throw err
    throw new ApiClientError('NETWORK_ERROR', 0, 'No hay conexión con el servidor.')
  }

  // 204 (aceptar las bases, marcar algo como visto, borrar): sin cuerpo; el esquema dice si se esperaba.
  if (res.status === 204) {
    const empty = schema.safeParse(undefined)
    if (empty.success) return empty.data
    throw new ApiClientError('BAD_RESPONSE', res.status, 'Respuesta vacía inesperada del servidor (204).')
  }

  let json: unknown
  try {
    json = await res.json()
  } catch (err) {
    if (signal?.aborted) throw err
    throw new ApiClientError('BAD_RESPONSE', res.status, `Respuesta no válida del servidor (${res.status}).`)
  }

  const failure = errorEnvelopeSchema.safeParse(json)
  if (failure.success) {
    const { code, message, details } = failure.data.error
    const error = new ApiClientError(code, res.status, message, details)
    error.retryAfterSeconds = retryAfter(res)
    throw error
  }
  if (!res.ok || !isDataEnvelope(json))
    throw new ApiClientError('BAD_RESPONSE', res.status, `Respuesta no válida del servidor (${res.status}).`)

  const data = schema.safeParse(json.data)
  if (!data.success)
    throw new ApiClientError(
      'BAD_RESPONSE',
      res.status,
      'La respuesta del servidor no tiene la forma esperada.',
      data.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    )
  return data.data
}

/**
 * ¿Merece la pena reintentar? Solo si el fallo puede ser pasajero: sin respuesta (estado 0) o un 5xx,
 * venga con el sobre o no (p. ej. el 502 en HTML de un proxy). No ante 4xx ni ante un
 * `BAD_RESPONSE` con 2xx (datos que no cumplen el esquema): es un desajuste de contrato y repetir la
 * petición daría lo mismo. Para `retry` de TanStack Query.
 */
export function isRetryable(error: unknown): boolean {
  if (!(error instanceof ApiClientError)) return false
  return error.status === 0 || error.status >= 500
}
