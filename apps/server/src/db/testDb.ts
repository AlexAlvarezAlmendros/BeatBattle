import { createDb, type Db } from './client'
import { runMigrations } from './migrate'

/**
 * BD para tests (guía §4.16): libSQL en memoria con todas las migraciones aplicadas. Cada llamada
 * crea una BD nueva y aislada, así que los tests pueden ir en paralelo sin limpiar nada.
 */
export async function createTestDb(): Promise<Db> {
  const db = await createDb(':memory:')
  await runMigrations(db)
  return db
}
