import type { DataEnvelope } from '@beatbattle/shared'
import type { FastifyInstance } from 'fastify'
import type { Health } from './schema'
import type { HealthService } from './service'

/** Rutas HTTP del módulo: traducen la petición, llaman al servicio y devuelven el sobre `{ data }`. */
export function healthRoutes(app: FastifyInstance, health: HealthService): void {
  app.get('/api/health', async (req): Promise<DataEnvelope<Health>> => {
    return { data: await health.check(req.now) }
  })
}
