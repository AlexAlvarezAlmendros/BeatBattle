import type { DataEnvelope } from '@beatbattle/shared'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Db } from '../../db/client'
import { kindInfo } from '../../email/catalog'
import { applyUnsubscribe, maskEmail, readUnsubscribeToken } from '../../email/unsubscribe'
import { appError } from '../../lib/errors'
import { BODY_LIMIT_BYTES } from '../../plugins/security'

export interface UnsubscribeDeps {
  db: Db
  secret: string
  newId: () => string
}

export interface UnsubscribeInfo {
  kind: string
  family: 'battle' | 'marketing'
  /** Destinatario enmascarado («a•••@example.com»). */
  email: string
}

const TokenQuery = z.object({ token: z.string().min(1).max(2048) })
const ApplyBody = z.object({ token: z.string().min(1).max(2048), scope: z.enum(['kind', 'all']) })

/**
 * Bajas sin sesión (guía §2.12.4, §4.19.6, `RF-NOTIF-05`):
 * - `GET /api/unsubscribe?token=` → a quién y de qué tipo (para la página `/baja`).
 * - `POST /api/unsubscribe` (JSON, con `Origin`) → la página aplica la baja de ese tipo o de todo.
 * - `POST /api/unsubscribe/one-click?token=` → la de la cabecera `List-Unsubscribe` (RFC 8058): la llama
 *   el cliente de correo, sin `Origin` y con un formulario (`List-Unsubscribe=One-Click`); da de baja de
 *   ese tipo. El cuerpo se descarta: manda el token de la URL.
 */
export function unsubscribeRoutes(app: FastifyInstance, deps: UnsubscribeDeps): void {
  const read = (token: string) => {
    const parsed = readUnsubscribeToken(deps.secret, token)
    if (!parsed) throw appError('NOT_FOUND', 'El enlace de baja no es válido.')
    return parsed
  }

  app.get('/api/unsubscribe', async (req): Promise<DataEnvelope<UnsubscribeInfo>> => {
    const { token } = TokenQuery.parse(req.query)
    const { address, kind } = read(token)
    const family = kindInfo(kind).family as UnsubscribeInfo['family']
    return { data: { kind, family, email: maskEmail(address) } }
  })

  app.post('/api/unsubscribe', async (req): Promise<DataEnvelope<{ scope: 'kind' | 'all' }>> => {
    const { token, scope } = ApplyBody.parse(req.body)
    const { address, kind } = read(token)
    await applyUnsubscribe(deps.db, { address, kind, scope, now: req.now, newId: deps.newId })
    return { data: { scope } }
  })

  // Contexto propio: el parser de formularios solo existe para esta ruta (no hay parsers globales).
  app.register(async (scope) => {
    scope.addContentTypeParser(
      ['application/x-www-form-urlencoded', 'multipart/form-data'],
      { parseAs: 'buffer', bodyLimit: BODY_LIMIT_BYTES },
      (_req, _body, done) => done(null, null),
    )
    scope.post(
      '/api/unsubscribe/one-click',
      { config: { skipOriginCheck: true, acceptForm: true } },
      async (req): Promise<DataEnvelope<{ scope: 'kind' }>> => {
        const { token } = TokenQuery.parse(req.query)
        const { address, kind } = read(token)
        await applyUnsubscribe(deps.db, { address, kind, scope: 'kind', now: req.now, newId: deps.newId })
        return { data: { scope: 'kind' } }
      },
    )
  })
}
