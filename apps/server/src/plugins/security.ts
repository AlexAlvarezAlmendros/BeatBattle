import type { FastifyInstance } from 'fastify'
import type { AppConfig } from '../config/env'
import { appError } from '../lib/errors'

/** Tope del cuerpo de cualquier petición (guía §4.10): el audio nunca pasa por la API. */
export const BODY_LIMIT_BYTES = 64 * 1024

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** Cuerpos de formulario: solo en las rutas con `acceptForm` (la baja en un clic, RFC 8058). */
export const FORM_TYPES = new Set(['application/x-www-form-urlencoded', 'multipart/form-data'])

/**
 * Cabeceras de seguridad de toda respuesta de la API (`RNF-SEC-01`, parte de la API). Además, si la
 * ruta no fija otro, `Cache-Control: no-store`. Las usa también la respuesta 503 de la función de
 * Vercel cuando la app no llega a arrancar (`serverless.ts`).
 */
export const API_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  // la API solo sirve JSON: no hay nada que cargar ni que enmarcar
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
}

declare module 'fastify' {
  interface FastifyContextConfig {
    /**
     * Exime la ruta de la comprobación de `Origin` (no del «solo JSON» ni del tamaño). Solo para
     * rutas que se autentican con su propio secreto o token y que no llama una página de un
     * navegador. La usa `POST /api/unsubscribe/one-click` (tarea 2.10).
     *
     * Exenciones previstas:
     * - `GET /api/cron/tick` (Fase 3, §4.10 y §4.12) **no la necesita**: es GET, y las lecturas no
     *   se comprueban. La autentica `CRON_SECRET` (en tiempo constante) en su `preHandler`, también
     *   cuando la llama el flujo programado de GitHub Actions, que debe usar GET.
     * - `POST /api/unsubscribe/one-click?token=` (Fase 2, §4.10, §4.19.1 y §4.19.6, RFC 8058) sí:
     *   la llama el proveedor de correo, sin `Origin`, con el cuerpo `List-Unsubscribe=One-Click` en
     *   `application/x-www-form-urlencoded` o `multipart/form-data`. Con el «solo JSON» de abajo
     *   daría 415, así que esa fase añadirá una segunda exención por ruta (p. ej.
     *   `config: { skipOriginCheck: true, acceptForm: true }`) con la que el hook deje pasar esos
     *   dos tipos solo en esa ruta, con el mismo tope de tamaño y sin registrar parsers globales (la
     *   ruta descarta el cuerpo). La autentica el token HMAC de la URL (`UNSUBSCRIBE_SECRET`).
     */
    skipOriginCheck?: boolean
    /**
     * Admite además `application/x-www-form-urlencoded` y `multipart/form-data` (con el mismo tope de
     * tamaño). Solo la baja en un clic (RFC 8058), que registra su parser dentro de su propio contexto.
     */
    acceptForm?: boolean
    /**
     * Subida al almacenamiento falso de los E2E (`/api/test/storage/upload`, nunca en producción): admite
     * `multipart/form-data` sin el tope de 64 kB, como Cloudinary. El audio de verdad nunca pasa por la API.
     */
    fakeStorageUpload?: boolean
  }
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
 * - **CSRF** (`RNF-SEC-05`): toda escritura (método distinto de GET/HEAD/OPTIONS) debe traer un
 *   `Origin` de `ALLOWED_ORIGINS` (o el de `BB_PUBLIC_URL`); ajeno o ausente → 403
 *   `FORBIDDEN_ORIGIN`. Los navegadores envían `Origin` siempre en POST/PUT/PATCH/DELETE. Todo lo
 *   que sirve este servidor vive bajo `/api`, pero la comprobación no mira la ruta: así ninguna
 *   variante (mayúsculas, barras dobles, rutas inexistentes) se la salta. Las excepciones se
 *   declaran por ruta con `skipOriginCheck`.
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
    if (SAFE_METHODS.has(req.method)) return

    if (req.routeOptions.config.skipOriginCheck !== true) {
      const origin = req.headers.origin
      if (!origin || !allowed.has(origin))
        throw appError('FORBIDDEN_ORIGIN', 'Petición rechazada: origen no permitido.')
    }

    const type = mediaType(req.headers['content-type'])
    const fakeUpload = req.routeOptions.config.fakeStorageUpload === true
    if (fakeUpload && config.env === 'production')
      throw appError('FORBIDDEN', 'El almacenamiento falso no existe en producción.')
    const formAllowed =
      (req.routeOptions.config.acceptForm === true || fakeUpload) &&
      type !== undefined &&
      FORM_TYPES.has(type)
    if (hasBody(req.headers) && type !== 'application/json' && !formAllowed)
      throw appError('UNSUPPORTED_MEDIA_TYPE', 'Solo se acepta application/json.')

    const length = Number(req.headers['content-length'])
    if (!fakeUpload && Number.isFinite(length) && length > BODY_LIMIT_BYTES)
      throw appError('PAYLOAD_TOO_LARGE', 'La petición es demasiado grande.')
  })

  app.addHook('onSend', async (_req, reply, payload) => {
    reply.headers(API_SECURITY_HEADERS)
    if (!reply.hasHeader('Cache-Control')) reply.header('Cache-Control', 'no-store')
    return payload
  })
}
