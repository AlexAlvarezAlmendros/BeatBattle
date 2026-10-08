import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Auth } from './auth'
import { CLIENT_IP_HEADER } from './auth'
import { AUTH_BASE_PATH } from './options'

type SessionResult = NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>
export type SessionUser = SessionResult['user']
export type SessionInfo = SessionResult['session']

declare module 'fastify' {
  interface FastifyRequest {
    /** La cuenta de la sesión, o `null` sin sesión (la decora el `preHandler` de sesión, §4.9). */
    user: SessionUser | null
    session: SessionInfo | null
  }
  interface FastifyInstance {
    auth: Auth
  }
}

/** Cabeceras de Fastify → `Headers` de Fetch, con la IP resuelta por Fastify y sin la que venga de fuera. */
function toHeaders(req: FastifyRequest): Headers {
  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined || name.toLowerCase() === CLIENT_IP_HEADER) continue
    for (const item of Array.isArray(value) ? value : [value]) headers.append(name, String(item))
  }
  headers.set(CLIENT_IP_HEADER, req.ip)
  return headers
}

/**
 * Better Auth en Fastify (guía §4.9):
 * - una ruta comodín `/api/auth/*` convierte la petición en un `Request` de Fetch y la pasa a
 *   `auth.handler` (la seguridad transversal de `plugins/security.ts` ya ha comprobado `Origin`, JSON y
 *   tamaño; Better Auth comprueba además sus `trustedOrigins`);
 * - el resto de rutas leen la sesión en un `preHandler` que decora `request.user` y `request.session`.
 */
export function authRoutes(app: FastifyInstance, auth: Auth): void {
  app.decorate('auth', auth)
  app.decorateRequest('user', null)
  app.decorateRequest('session', null)

  app.route({
    method: ['GET', 'POST'],
    url: `${AUTH_BASE_PATH}/*`,
    async handler(req, reply) {
      const url = new URL(req.url, 'http://localhost')
      const body =
        req.method === 'GET' || req.body === undefined || req.body === null
          ? undefined
          : JSON.stringify(req.body)
      const response = await auth.handler(
        new Request(new URL(url.pathname + url.search, auth.options.baseURL as string), {
          method: req.method,
          headers: toHeaders(req),
          body,
        }),
      )
      reply.status(response.status)
      // Varias cookies en una respuesta: cada `Set-Cookie` por separado (`Headers` las juntaría).
      for (const cookie of response.headers.getSetCookie()) reply.header('set-cookie', cookie)
      response.headers.forEach((value, name) => {
        if (name !== 'set-cookie') reply.header(name, value)
      })
      return reply.send(response.body ? Buffer.from(await response.arrayBuffer()) : null)
    },
  })

  app.addHook('preHandler', async (req) => {
    if (req.url.startsWith(`${AUTH_BASE_PATH}/`)) return
    const result = await auth.api.getSession({ headers: toHeaders(req) })
    req.user = result?.user ?? null
    req.session = result?.session ?? null
  })
}
