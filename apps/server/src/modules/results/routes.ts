import {
  type Archive,
  ArchiveQuerySchema,
  type DataEnvelope,
  DisqualifyRequestSchema,
  type WeekResults,
  WeekSlugSchema,
} from '@beatbattle/shared'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { appError } from '../../lib/errors'
import type { ResultsService } from './service'

const userOf = (req: FastifyRequest) => req.user?.id as string

function slugOf(req: FastifyRequest<{ Params: { slug: string } }>): string {
  const slug = WeekSlugSchema.safeParse(req.params.slug)
  if (!slug.success) throw appError('NOT_FOUND', 'No existe esa semana.')
  return slug.data
}

/**
 * Resultados (§4.10; tareas 6.3–6.7): los públicos (la clasificación sellada y el archivo) y los de admin
 * (descalificar y re-sellar; `/api/admin` lleva su guarda sin que nadie tenga que acordarse).
 */
export function resultsRoutes(app: FastifyInstance, service: ResultsService): void {
  app.get<{ Params: { slug: string } }>(
    '/api/weeks/:slug/results',
    async (req): Promise<DataEnvelope<WeekResults>> => ({
      data: await service.results(slugOf(req), req.user?.id ?? null, req.now),
    }),
  )

  app.get('/api/weeks', async (req): Promise<DataEnvelope<Archive>> => {
    const { cursor } = ArchiveQuerySchema.parse(req.query)
    return { data: await service.archive(cursor, req.now) }
  })

  app.post<{ Params: { id: string } }>('/api/admin/entries/:id/disqualify', async (req, reply) => {
    if (!/^[\w-]{1,64}$/.test(req.params.id)) throw appError('NOT_FOUND', 'No existe esa entrada.')
    await service.disqualify(userOf(req), req.params.id, DisqualifyRequestSchema.parse(req.body), req.now)
    return reply.code(204).send()
  })

  app.post<{ Params: { slug: string } }>(
    '/api/admin/weeks/:slug/reseal',
    async (req): Promise<DataEnvelope<{ revision: number }>> => ({
      data: await service.reseal(userOf(req), slugOf(req), req.now),
    }),
  )
}
