import {
  type DataEnvelope,
  EntryAudioReplaceSchema,
  EntryCreateSchema,
  EntryUpdateSchema,
  type OwnEntry,
  type PublicEntry,
  WeekSlugSchema,
} from '@beatbattle/shared'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { requireSession, requireVerified } from '../../auth/guards'
import { appError } from '../../lib/errors'
import type { EntriesService } from './service'

/** Un id con forma de id; el resto da 404 sin tocar la BD. */
function idOf(req: FastifyRequest<{ Params: { id: string } }>): string {
  const id = req.params.id
  if (!/^[\w-]{1,64}$/.test(id)) throw appError('NOT_FOUND', 'No existe esa entrada.')
  return id
}

const userOf = (req: FastifyRequest) => req.user?.id as string

/**
 * Entradas (§4.10, tareas 4.6–4.7): registrar la entrada tras la subida (`POST /api/weeks/:slug/entries`,
 * cuenta verificada, `RF-AUTH-01`), la ficha pública (`GET /api/entries/:id`, que respeta el voto ciego) y,
 * para su dueño, editar, sustituir el audio y retirar. La firma de la subida va por `/api/uploads/sign`.
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

  app.get<{ Params: { slug: string } }>(
    '/api/weeks/:slug/entries/mine',
    { preHandler: requireSession },
    async (req): Promise<DataEnvelope<OwnEntry>> => {
      const slug = WeekSlugSchema.safeParse(req.params.slug)
      if (!slug.success) throw appError('NOT_FOUND', 'No existe esa semana.')
      const own = await service.mineBySlug(userOf(req), slug.data, req.now)
      if (!own) throw appError('NOT_FOUND', 'No tienes entrada en esta semana.')
      return { data: own }
    },
  )

  app.get<{ Params: { id: string } }>('/api/entries/:id', async (req): Promise<DataEnvelope<PublicEntry>> => {
    return { data: await service.publicEntry(idOf(req), req.user?.id ?? null) }
  })

  app.patch<{ Params: { id: string } }>(
    '/api/entries/:id',
    { preHandler: requireSession },
    async (req): Promise<DataEnvelope<OwnEntry>> => {
      return {
        data: await service.update(userOf(req), idOf(req), EntryUpdateSchema.parse(req.body), req.now),
      }
    },
  )

  app.put<{ Params: { id: string } }>(
    '/api/entries/:id/audio',
    { preHandler: requireVerified },
    async (req): Promise<DataEnvelope<OwnEntry>> => {
      return {
        data: await service.replaceAudio(
          userOf(req),
          idOf(req),
          EntryAudioReplaceSchema.parse(req.body),
          req.now,
        ),
      }
    },
  )

  app.delete<{ Params: { id: string } }>(
    '/api/entries/:id',
    { preHandler: requireSession },
    async (req, reply) => {
      await service.withdraw(userOf(req), idOf(req), req.now)
      return reply.code(204).send()
    },
  )
}
