import type { FastifyInstance } from 'fastify'
import { EMAIL_CATALOG, type EmailKind } from '../../email/catalog'
import type { Mailer, MemoryMailer } from '../../email/mailer'

/**
 * Solo con `NODE_ENV=test` y el `Mailer` en memoria (los E2E, guía §4.15): `GET /api/test/mailbox?to=` da
 * el último email a esa dirección (asunto y texto), para seguir enlaces de verificación sin un buzón real.
 * `GET /api/test/unsubscribe-link?to=&kind=` da el enlace de baja (la página) que llevaría un aviso de ese
 * tipo: los avisos de la batalla aún no salen (Fase 3), y el E2E del hito prueba la baja con él.
 * En desarrollo y en producción las rutas no existen (`buildApp` no las registra).
 */
export function testingRoutes(app: FastifyInstance, mailer: Mailer | null): void {
  const memory = mailer as MemoryMailer | null
  if (!memory || typeof memory.lastTo !== 'function') return
  app.get<{ Querystring: { to?: string } }>('/api/test/mailbox', async (req) => {
    const last = memory.lastTo(String(req.query.to ?? ''))
    return { data: last ? { subject: last.subject, text: last.text } : null }
  })
  app.get<{ Querystring: { to?: string; kind?: string } }>('/api/test/unsubscribe-link', async (req) => {
    const kind = (req.query.kind ?? 'battle.reminder') as EmailKind
    if (!(kind in EMAIL_CATALOG)) return { data: null }
    return { data: { url: app.email.unsubscribeLinks.page(String(req.query.to ?? '').toLowerCase(), kind) } }
  })
}
