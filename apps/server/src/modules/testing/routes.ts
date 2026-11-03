import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Db } from '../../db/client'
import { user } from '../../db/schema'
import { EMAIL_CATALOG, type EmailKind } from '../../email/catalog'
import type { Mailer, MemoryMailer } from '../../email/mailer'
import { reprocessGame } from '../game/reprocess'

/**
 * Solo con `NODE_ENV=test` y el `Mailer` en memoria (los E2E, guía §4.15): `GET /api/test/mailbox?to=` da
 * el último email a esa dirección (asunto, texto y HTML, y cuántos hay), para seguir enlaces de verificación sin un
 * buzón real; con `&contains=`, el último cuyo asunto lleve ese texto, y con `&text=`, el último cuyo texto plano lo
 * lleve (el hito de la Fase 7 cuenta así su `season.wrap` y captura su `game.progress`).
 * `GET /api/test/unsubscribe-link?to=&kind=` da el enlace de baja (la página) que llevaría un aviso de ese
 * tipo: los avisos de la batalla aún no salen (Fase 3), y el E2E del hito prueba la baja con él.
 * `POST /api/test/role { email, role }` da o quita el rol de admin (los E2E del panel, Fase 3: en producción
 * el rol lo pone el plugin `admin` de Better Auth, a mano).
 * `POST /api/test/game/reprocess` reprocesa la capa de juego con el reloj de la petición y responde su resumen (tarea
 * 7.16: los E2E comprueban que reprocesar no duplica nada; fuera de test, el script `game:reprocess`).
 * En desarrollo y en producción las rutas no existen (`buildApp` no las registra).
 */
export function testingRoutes(
  app: FastifyInstance,
  mailer: Mailer | null,
  db: Db,
  newId: () => string,
): void {
  const RoleSchema = z.object({ email: z.email(), role: z.enum(['user', 'admin']) }).strict()
  app.post('/api/test/role', async (req) => {
    const { email, role } = RoleSchema.parse(req.body)
    await db.update(user).set({ role }).where(sql`lower(${user.email}) = ${email.toLowerCase()}`)
    return { data: { email, role } }
  })
  app.post('/api/test/game/reprocess', async (req) => {
    const summary = await reprocessGame({ db, now: req.now, newId, apply: true })
    return { data: summary }
  })
  const memory = mailer as MemoryMailer | null
  if (!memory || typeof memory.lastTo !== 'function') return
  app.get<{ Querystring: { to?: string; contains?: string; text?: string } }>(
    '/api/test/mailbox',
    async (req) => {
      const to = String(req.query.to ?? '').toLowerCase()
      const { contains } = req.query
      const text = req.query.text?.toLowerCase()
      // `contains`: el asunto lleva ese texto; `text`: el texto plano lo lleva, sin distinguir mayúsculas (cuando a la
      // misma dirección salen varios). `count`: cuántos de esa dirección lo cumplen (lo que sale una sola vez).
      const matching = memory.sent.filter(
        (mail) =>
          mail.to.toLowerCase() === to &&
          (!contains || mail.subject.includes(contains)) &&
          (!text || mail.text.toLowerCase().includes(text)),
      )
      const last = matching.at(-1)
      return {
        data: last
          ? { subject: last.subject, text: last.text, html: last.html, count: matching.length }
          : null,
      }
    },
  )
  app.get<{ Querystring: { to?: string; kind?: string } }>('/api/test/unsubscribe-link', async (req) => {
    const kind = (req.query.kind ?? 'battle.reminder') as EmailKind
    if (!(kind in EMAIL_CATALOG)) return { data: null }
    return { data: { url: app.email.unsubscribeLinks.page(String(req.query.to ?? '').toLowerCase(), kind) } }
  })
}
