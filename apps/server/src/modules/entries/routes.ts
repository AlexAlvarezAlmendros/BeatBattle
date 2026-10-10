import { type DataEnvelope, EntryCreateSchema, type OwnEntry, WeekSlugSchema } from '@beatbattle/shared'
import type { FastifyInstance } from 'fastify'
import { requireVerified } from '../../auth/guards'
import { appError } from '../../lib/errors'
import type { EntriesService } from './service'

/**
 * Entradas (§4.10, tareas 4.6–4.7): registrar la entrada tras la subida (`POST /api/weeks/:slug/entries`,
 * cuenta verificada, `RF-AUTH-01`). La firma de la subida va por `/api/uploads/sign` (`uploadsRoutes`).
 */
export function entriesRoutes(app: FastifyInstance, service: EntriesService): void {
  app.post<{ Params: { slug: string } }>(
    '/api/weeks/:slug/entries',
    { preHandler: requireVerified },
    async (req, reply): Promise<DataEnvelope<OwnEntry>> => {
      const slug = WeekSlugSchema.safeParse(req.params.slug)
      if (!slug.success) throw appError('NOT_FOUND', 'No existe esa semana.')
      const created = await service.create(
        req.user?.id as string,
        slug.data,
        EntryCreateSchema.parse(req.body),
        req.now,
      )
      reply.code(201)
      return { data: created }
    },
  )
}
