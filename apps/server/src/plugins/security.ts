import type { FastifyInstance } from 'fastify'
import type { AppConfig } from '../config/env'
import { appError } from '../lib/errors'

/** Tope del cuerpo de cualquier petición (guía §4.10): el audio nunca pasa por la API. */
export const BODY_LIMIT_BYTES = 64 * 1024

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Rutas de escritura exentas de la comprobación de `Origin`. Vacío en la Fase 0.
 *
 * Hueco previsto: `/api/cron/*` (Fase 3, §4.12). Vercel Cron llama por GET, que ya no se comprueba,
 * pero si el flujo de GitHub Actions la llama con un método de escritura no traerá `Origin`: esa ruta
 * se añadirá aquí y se autenticará con `CRON_SECRET` (comparación en tiempo constante) en su propio
 * `preHandler`. Nada más debe entrar en esta lista sin otra autenticación equivalente.
 */
export const ORIGIN_CHECK_EXEMPT_PREFIXES: readonly string[] = []

function isApiPath(url: string): boolean {
  return url === '/api' || url.startsWith('/api/') || url.startsWith('/api?')
}

/** Tipo de medio sin parámetros (`application/json; charset=utf-8` → `application/json`). */
function mediaType(header: string | undefined): string | undefined {
  return header?.split(';', 1)[0]?.trim().toLowerCase()
}

function hasBody(headers: Record<string, string | string[] | undefined>): boolean {
  const length = headers['content-length']
  if (length !== undefined && length !== '0') return true
  return headers['transfer-encoding'] !== undefined
}

/**
 * Seguridad transversal de la API (guía §4.10, §4.13):
 * - **CSRF** (`RNF-SEC-05`): toda escritura (método distinto de GET/HEAD/OPTIONS) bajo `/api` debe
 *   traer un `Origin` de `ALLOWED_ORIGINS` (o el de `BB_PUBLIC_URL`); ajeno o ausente → 403
 *   `FORBIDDEN_ORIGIN`. Los navegadores envían `Origin` siempre en POST/PUT/PATCH/DELETE.
 * - **Solo JSON** (`RNF-SEC-05`): una escritura con cuerpo debe ser `application/json` → si no, 415
 *   `UNSUPPORTED_MEDIA_TYPE`. Se quita además el parser de `text/plain` de Fastify, así un formulario
 *   de otro sitio no puede mandar un cuerpo que la API entienda.
 * - **Tamaño**: `Content-Length` > 64 kB se corta aquí con 413 sin leer el cuerpo; los cuerpos sin
 *   longitud los corta el `bodyLimit` de Fastify (mismo valor).
 * - **Cabeceras** (`RNF-SEC-01`, parte de la API) en todas las respuestas. La CSP de la web y HSTS
 *   las pone `vercel.json`.
 */
export function registerSecurity(app: FastifyInstance, config: AppConfig): void {
  app.removeContentTypeParser('text/plain')
  const allowed = new Set(config.allowedOrigins)

  app.addHook('onRequest', async (req) => {
    if (SAFE_METHODS.has(req.method) || !isApiPath(req.url)) return

    const exempt = ORIGIN_CHECK_EXEMPT_PREFIXES.some((p) => req.url.startsWith(p))
    if (!exempt) {
      const origin = req.headers.origin
      if (!origin || !allowed.has(origin))
        throw appError('FORBIDDEN_ORIGIN', 'Petición rechazada: origen no permitido.')
    }

    if (hasBody(req.headers) && mediaType(req.headers['content-type']) !== 'application/json')
      throw appError('UNSUPPORTED_MEDIA_TYPE', 'Solo se acepta application/json.')

    const length = Number(req.headers['content-length'])
    if (Number.isFinite(length) && length > BODY_LIMIT_BYTES)
      throw appError('PAYLOAD_TOO_LARGE', 'La petición es demasiado grande.')
  })

  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff')
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin')
    reply.header('X-Frame-Options', 'DENY')
    // la API solo sirve JSON: no hay nada que cargar ni que enmarcar
    reply.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
    if (!reply.hasHeader('Cache-Control')) reply.header('Cache-Control', 'no-store')
    return payload
  })
}
