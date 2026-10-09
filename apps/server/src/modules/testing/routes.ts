import type { FastifyInstance } from 'fastify'
import type { Mailer, MemoryMailer } from '../../email/mailer'

/**
 * Solo con `NODE_ENV=test` y el `Mailer` en memoria (los E2E, guía §4.15): `GET /api/test/mailbox?to=` da
 * el último email a esa dirección (asunto y texto), para seguir enlaces de verificación sin un buzón real.
 * En desarrollo y en producción la ruta no existe (`buildApp` no la registra).
 */
export function testingRoutes(app: FastifyInstance, mailer: Mailer | null): void {
  const memory = mailer as MemoryMailer | null
  if (!memory || typeof memory.lastTo !== 'function') return
  app.get<{ Querystring: { to?: string } }>('/api/test/mailbox', async (req) => {
    const last = memory.lastTo(String(req.query.to ?? ''))
    return { data: last ? { subject: last.subject, text: last.text } : null }
  })
}
