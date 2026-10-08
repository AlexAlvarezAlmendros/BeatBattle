import { type ActiveSession, type DataEnvelope, describeUserAgent } from '@beatbattle/shared'
import { and, desc, eq, gt } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { requireSession } from '../../auth/guards'
import type { Db } from '../../db/client'
import { session } from '../../db/schema'
import { AppError } from '../../lib/errors'

/**
 * Ajustes → Sesiones (§2.3, `RF-AUTH-10`, tarea 2.20). No se usa `list-sessions` de Better Auth: devuelve
 * el token de cada sesión al navegador y exige una sesión de menos de un día (`freshAge`). Aquí sale lo
 * justo para reconocerla, y se cierra por su id, solo si es de la cuenta y no es la actual. «Cerrar las
 * demás» sigue siendo `/api/auth/revoke-other-sessions`, que avisa con `auth.security`.
 */
export function sessionsRoutes(app: FastifyInstance, deps: { db: Db }): void {
  app.get(
    '/api/me/sessions',
    { preHandler: requireSession },
    async (req): Promise<DataEnvelope<ActiveSession[]>> => {
      const userId = req.user?.id as string
      const rows = await deps.db
        .select()
        .from(session)
        .where(and(eq(session.userId, userId), gt(session.expiresAt, new Date(req.now))))
        .orderBy(desc(session.updatedAt))
      const currentId = req.session?.id
      const list = rows.map((row) => ({
        id: row.id,
        device: describeUserAgent(row.userAgent) ?? null,
        createdAt: row.createdAt.getTime(),
        lastActiveAt: row.updatedAt.getTime(),
        current: row.id === currentId,
      }))
      // La de esta petición, primero.
      return { data: [...list.filter((item) => item.current), ...list.filter((item) => !item.current)] }
    },
  )

  app.delete<{ Params: { id: string } }>(
    '/api/me/sessions/:id',
    { preHandler: requireSession },
    async (req): Promise<DataEnvelope<{ closed: true }>> => {
      if (req.params.id === req.session?.id)
        throw new AppError('BAD_REQUEST', 'Para cerrar esta sesión, sal de la cuenta.')
      const deleted = await deps.db
        .delete(session)
        .where(and(eq(session.id, req.params.id), eq(session.userId, req.user?.id as string)))
        .returning({ id: session.id })
      if (deleted.length === 0) throw new AppError('NOT_FOUND', 'Esa sesión ya no está abierta.')
      return { data: { closed: true } }
    },
  )
}
