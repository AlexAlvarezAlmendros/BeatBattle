import { type DataEnvelope, SeasonIdSchema, type SeasonStandings } from '@beatbattle/shared'
import type { FastifyInstance } from 'fastify'
import { appError } from '../../lib/errors'
import type { SeasonsService } from './service'

/** Temporadas (§4.10; tarea 7.11). */
export function seasonsRoutes(app: FastifyInstance, service: SeasonsService): void {
  app.get<{ Params: { id: string } }>(
    '/api/seasons/:id/standings',
    async (req): Promise<DataEnvelope<SeasonStandings>> => {
      const id = SeasonIdSchema.safeParse(req.params.id)
      if (!id.success) throw appError('NOT_FOUND', 'No existe esa temporada.')
      return { data: await service.standings(id.data, req.now) }
    },
  )
}
