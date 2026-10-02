import type { Db } from '../../db/client'
import { AppError } from '../../lib/errors'
import { healthRepo } from './repo'
import type { Health } from './schema'

export interface HealthService {
  /** Estado de la API en el instante `now`; lanza 503 `SERVICE_UNAVAILABLE` si la BD no responde. */
  check(now: number): Promise<Health>
}

/**
 * Lógica del módulo: recibe sus dependencias y el instante ya resuelto (`request.now`); no sabe nada
 * de HTTP. Patrón de todos los módulos: `routes` → `service` → `repo`, con `schema` para los
 * contratos.
 */
export function createHealthService(db: Db): HealthService {
  return {
    async check(now) {
      try {
        await healthRepo.ping(db)
      } catch (cause) {
        throw new AppError('SERVICE_UNAVAILABLE', 503, 'Servicio no disponible.', { db: 'down' }, { cause })
      }
      return { status: 'ok', db: 'up', time: now }
    },
  }
}
