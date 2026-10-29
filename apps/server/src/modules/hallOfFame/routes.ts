import type { DataEnvelope, HallOfFame } from '@beatbattle/shared'
import type { FastifyInstance } from 'fastify'
import type { HallOfFameService } from './service'

/** El salón de la fama (§4.10; tarea 7.12): público. */
export function hallOfFameRoutes(app: FastifyInstance, service: HallOfFameService): void {
  app.get(
    '/api/hall-of-fame',
    async (req): Promise<DataEnvelope<HallOfFame>> => ({ data: await service.hallOfFame(req.now) }),
  )
}
