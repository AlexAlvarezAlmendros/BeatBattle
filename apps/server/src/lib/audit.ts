import type { BatchStatement } from '../db/batch'
import type { Db } from '../db/client'
import { auditLog } from '../db/schema'

/**
 * Registro de las acciones de admin (`RF-ADM-05`, §2.14). Devuelve la sentencia para meterla en el mismo
 * `batch` que la acción: o quedan las dos, o ninguna. Nunca guarda emails ni secretos; `payload` lleva lo
 * que cambió.
 */
export function auditStatement(
  db: Db,
  entry: {
    id: string
    actorId: string
    action: string
    target: string
    reason?: string | null
    payload?: unknown
    now: number
  },
): BatchStatement {
  return db.insert(auditLog).values({
    id: entry.id,
    actorId: entry.actorId,
    action: entry.action,
    target: entry.target,
    reason: entry.reason ?? null,
    payload: entry.payload === undefined ? null : JSON.stringify(entry.payload),
    createdAt: entry.now,
  })
}
