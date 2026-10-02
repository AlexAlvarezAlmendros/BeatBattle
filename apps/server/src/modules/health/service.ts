import type { Db } from '../../db/client'
import { appError } from '../../lib/errors'
import { healthRepo } from './repo'
import type { Health } from './schema'

export interface HealthService {
  /** Estado de la API en el instante `now`; lanza 503 `SERVICE_UNAVAILABLE` si la BD no responde. */
  check(now: number): Promise<Health>
}

/** Dependencias del servicio (patrón de `app.ts`: un objeto, aunque hoy solo sea la BD). */
export interface HealthDeps {
  db: Db
}

/**
 * Lógica del módulo: recibe sus dependencias y el instante ya resuelto (`request.now`); no sabe nada
 * de HTTP. Patrón de todos los módulos (ver `app.ts`): `routes` → `service` → `repo`, con `schema`
 * para los contratos.
 */
export function createHealthService({ db }: HealthDeps): HealthService {
  return {
    async check(now) {
      try {
        await healthRepo.ping(db)
      } catch (cause) {
        throw appError('SERVICE_UNAVAILABLE', 'Servicio no disponible.', { details: { db: 'down' }, cause })
      }
      return { status: 'ok', db: 'up', time: now }
    },
  }
}
