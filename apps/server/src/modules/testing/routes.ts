import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Db } from '../../db/client'
import { user } from '../../db/schema'
import { EMAIL_CATALOG, type EmailKind } from '../../email/catalog'
import type { Mailer, MemoryMailer } from '../../email/mailer'

/**
 * Solo con `NODE_ENV=test` y el `Mailer` en memoria (los E2E, guía §4.15): `GET /api/test/mailbox?to=` da
 * el último email a esa dirección (asunto y texto), para seguir enlaces de verificación sin un buzón real;
 * con `&contains=`, el último cuyo asunto lleve ese texto.
 * `GET /api/test/unsubscribe-link?to=&kind=` da el enlace de baja (la página) que llevaría un aviso de ese
 * tipo: los avisos de la batalla aún no salen (Fase 3), y el E2E del hito prueba la baja con él.
 * `POST /api/test/role { email, role }` da o quita el rol de admin (los E2E del panel, Fase 3: en producción
 * el rol lo pone el plugin `admin` de Better Auth, a mano).
 * En desarrollo y en producción las rutas no existen (`buildApp` no las registra).
 */
export function testingRoutes(app: FastifyInstance, mailer: Mailer | null, db: Db): void {
  const RoleSchema = z.object({ email: z.email(), role: z.enum(['user', 'admin']) }).strict()
  app.post('/api/test/role', async (req) => {
    const { email, role } = RoleSchema.parse(req.body)
    await db.update(user).set({ role }).where(sql`lower(${user.email}) = ${email.toLowerCase()}`)
    return { data: { email, role } }
  })
  const memory = mailer as MemoryMailer | null
  if (!memory || typeof memory.lastTo !== 'function') return
  app.get<{ Querystring: { to?: string; contains?: string } }>('/api/test/mailbox', async (req) => {
    const to = String(req.query.to ?? '').toLowerCase()
    const contains = req.query.contains
    // `contains`: el último cuyo asunto lleve ese texto (cuando a la misma dirección salen varios).
    const last = contains
      ? [...memory.sent]
          .reverse()
          .find((mail) => mail.to.toLowerCase() === to && mail.subject.includes(contains))
      : memory.lastTo(to)
    return { data: last ? { subject: last.subject, text: last.text } : null }
  })
  app.get<{ Querystring: { to?: string; kind?: string } }>('/api/test/unsubscribe-link', async (req) => {
    const kind = (req.query.kind ?? 'battle.reminder') as EmailKind
    if (!(kind in EMAIL_CATALOG)) return { data: null }
    return { data: { url: app.email.unsubscribeLinks.page(String(req.query.to ?? '').toLowerCase(), kind) } }
  })
}
