import { AlertConfirmSchema, AlertSubscribeSchema, type DataEnvelope } from '@beatbattle/shared'
import type { FastifyInstance } from 'fastify'
import { ipHash } from '../../lib/ipHash'
import type { RateLimiter } from '../../lib/rateLimit'
import type { AlertsService } from './service'

/** Altas sin cuenta: 3 por hora e IP (§4.13). */
export const ALERT_SUBSCRIBES_PER_HOUR = 3
const HOUR_MS = 60 * 60 * 1000

/**
 * Alerta de drop sin cuenta (§2.12.3, §4.10; tarea 3.13). Confirmar es un `POST` desde la página
 * `/alerta` de la web, no un `GET` del enlace: los escáneres de enlaces del correo abren los `GET` y
 * confirmarían solos.
 */
export function alertsRoutes(
  app: FastifyInstance,
  deps: { service: AlertsService; rateLimiter: RateLimiter; secret: string },
): void {
  app.post('/api/subscribe', async (req, reply): Promise<DataEnvelope<{ status: 'pending' }>> => {
    const { email } = AlertSubscribeSchema.parse(req.body)
    await deps.rateLimiter.enforce({
      key: `subscribe:ip:${ipHash(req.ip, deps.secret, req.now) ?? 'desconocida'}`,
      limit: ALERT_SUBSCRIBES_PER_HOUR,
      windowMs: HOUR_MS,
      now: req.now,
    })
    await deps.service.subscribe(email, req.now)
    reply.code(202)
    return { data: { status: 'pending' } }
  })

  app.post('/api/subscribe/confirm', async (req): Promise<DataEnvelope<{ status: 'confirmed' }>> => {
    const { token } = AlertConfirmSchema.parse(req.body)
    await deps.service.confirm(token, req.now)
    return { data: { status: 'confirmed' } }
  })
}
