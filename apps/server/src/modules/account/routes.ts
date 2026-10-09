import { AccountDeleteSchema, type DataEnvelope } from '@beatbattle/shared'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { requireSession } from '../../auth/guards'
import { runBatch } from '../../db/batch'
import type { Db } from '../../db/client'
import { user } from '../../db/schema'
import type { ServiceEmails } from '../../email/service'
import { appError } from '../../lib/errors'
import type { RateLimiter } from '../../lib/rateLimit'
import type { ImageStorage } from '../storage/cloudinary'
import { ACCOUNT_DATA } from './modules'
import type { AccountContext } from './registry'

/** Exportaciones: 10 por hora y cuenta (cada una lee todas las tablas). */
const EXPORTS_PER_HOUR = 10
const HOUR_MS = 60 * 60 * 1000

/** Las cookies de sesión de Better Auth (prefijo `bb`, §4.9), con y sin `__Secure-`. */
const SESSION_COOKIES = ['session_token', 'session_data', 'dont_remember'].flatMap((name) => [
  `bb.${name}`,
  `__Secure-bb.${name}`,
])

export interface AccountDeps {
  db: Db
  images: ImageStorage | null
  emails: ServiceEmails
  rateLimiter: RateLimiter
}

/** Versión del formato de la exportación: cambia si cambia la forma del JSON. */
export const EXPORT_FORMAT = 'beatbattle-export/1'

/**
 * Derechos sobre los datos (guía §4.14, tarea 2.21): exportarlos (`RF-PRF-05`) y borrar la cuenta
 * (`RF-PRF-04`), los dos desde Ajustes → Privacidad.
 */
export function accountRoutes(app: FastifyInstance, deps: AccountDeps): void {
  const contextOf = async (userId: string, now: number): Promise<AccountContext> => {
    const [row] = await deps.db.select({ email: user.email }).from(user).where(eq(user.id, userId))
    if (!row) throw appError('NOT_FOUND', 'No hay ninguna cuenta.')
    return { db: deps.db, images: deps.images, userId, email: row.email.toLowerCase(), now }
  }

  app.get('/api/me/export', { preHandler: requireSession }, async (req, reply) => {
    const userId = req.user?.id as string
    await deps.rateLimiter.enforce({
      key: `export:user:${userId}`,
      limit: EXPORTS_PER_HOUR,
      windowMs: HOUR_MS,
      now: req.now,
    })
    const ctx = await contextOf(userId, req.now)
    const sections: Record<string, unknown> = {}
    for (const module of ACCOUNT_DATA) sections[module.name] = await module.exportData(ctx)
    const day = new Date(req.now).toISOString().slice(0, 10)
    const name = (req.user as { username?: string | null }).username ?? 'cuenta'
    reply.header('Content-Disposition', `attachment; filename="beatbattle-${name}-${day}.json"`)
    reply.header('Cache-Control', 'no-store')
    return { data: { format: EXPORT_FORMAT, exportedAt: req.now, ...sections } }
  })

  app.delete(
    '/api/me',
    { preHandler: requireSession },
    async (req, reply): Promise<DataEnvelope<{ deleted: true }>> => {
      const { confirm } = AccountDeleteSchema.parse(req.body)
      const account = req.user as {
        id: string
        username?: string | null
        displayUsername?: string | null
        name: string
      }
      if (confirm.toLowerCase() !== (account.username ?? '').toLowerCase())
        throw appError('VALIDATION_FAILED', 'La confirmación no coincide con tu nombre de productor.', {
          details: [{ path: 'body.confirm', message: 'no coincide' }],
        })
      const ctx = await contextOf(account.id, req.now)
      const statements = []
      const external = []
      for (const module of ACCOUNT_DATA) {
        const part = await module.cleanup(ctx)
        statements.push(...part.statements)
        external.push(...(part.external ?? []))
      }
      // El último email (`account.deleted`), en el mismo batch: a la dirección, porque la cuenta ya no existe.
      const farewell = deps.emails.prepare({
        kind: 'account.deleted',
        target: { address: ctx.email },
        payload: { name: account.displayUsername || account.username || account.name },
      })
      await runBatch(deps.db, [...statements, farewell.statement])
      for (const item of external)
        await item
          .run()
          .catch((error) => req.log.warn({ err: error, what: item.describe }, 'limpieza externa pendiente'))
      await deps.emails.flush([farewell.id])
      for (const name of SESSION_COOKIES)
        reply.header(
          'Set-Cookie',
          `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${name.startsWith('__Secure-') ? '; Secure' : ''}`,
        )
      return { data: { deleted: true } }
    },
  )
}
