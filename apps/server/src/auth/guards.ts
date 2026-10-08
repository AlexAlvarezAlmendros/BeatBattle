import type { FastifyInstance, FastifyRequest, preHandlerHookHandler } from 'fastify'
import { appError } from '../lib/errors'

/**
 * Guardas de ruta (guía §2.2, tarea 2.5), como `preHandler` de cada ruta. La sesión ya la ha leído el
 * `preHandler` de `auth/routes.ts` (`request.user`).
 *
 * - `requireSession`: sin sesión → 401. Una cuenta bloqueada tampoco tiene sesión (`RF-AUTH-02`): el
 *   bloqueo revoca sus sesiones, y si quedara alguna, aquí se rechaza igual.
 * - `requireVerified`: además, el email verificado (`RF-AUTH-01`): descargar, subir y votar.
 * - `requireAdmin`: además, el rol `admin` (`RF-AUTH-03`). Toda ruta bajo `/api/admin` lo lleva sin que
 *   nadie tenga que acordarse (`registerAdminGuard`).
 */

function sessionUser(req: FastifyRequest) {
  const user = req.user
  if (!user || (user as { banned?: boolean | null }).banned)
    throw appError('UNAUTHORIZED', 'Hace falta iniciar sesión.')
  return user
}

export const requireSession: preHandlerHookHandler = async (req) => {
  sessionUser(req)
}

export const requireVerified: preHandlerHookHandler = async (req) => {
  if (!sessionUser(req).emailVerified)
    throw appError('EMAIL_NOT_VERIFIED', 'Verifica tu email para descargar, subir y votar.')
}

export const requireAdmin: preHandlerHookHandler = async (req) => {
  const user = sessionUser(req)
  if ((user as { role?: string | null }).role !== 'admin')
    throw appError('FORBIDDEN', 'Solo para administración.')
}

export const ADMIN_PREFIX = '/api/admin'

/**
 * Pone `requireAdmin` delante de toda ruta bajo `/api/admin` (`RF-AUTH-03`). Se registra antes que las
 * rutas: así una ruta de admin nueva no puede quedarse sin guarda por olvido.
 */
export function registerAdminGuard(app: FastifyInstance): void {
  app.addHook('onRoute', (route) => {
    if (route.url !== ADMIN_PREFIX && !route.url.startsWith(`${ADMIN_PREFIX}/`)) return
    const existing = route.preHandler
      ? Array.isArray(route.preHandler)
        ? route.preHandler
        : [route.preHandler]
      : []
    route.preHandler = [requireAdmin, ...existing]
  })
}
