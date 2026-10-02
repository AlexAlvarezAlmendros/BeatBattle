import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/libsql/migrator'
import type { Db } from './client'

/**
 * Carpeta de migraciones generadas por drizzle-kit (`pnpm --filter @beatbattle/server db:generate`).
 * En la función de Vercel el código va empaquetado: allí se pasa la ruta explícita (`api/index.ts`).
 */
export const MIGRATIONS_DIR = fileURLToPath(new URL('../../drizzle', import.meta.url))

/** Aplica las migraciones pendientes (idempotente). Se ejecuta al arrancar el servidor. */
export async function runMigrations(db: Db, migrationsFolder: string = MIGRATIONS_DIR): Promise<void> {
  await migrate(db, { migrationsFolder })
  // `migrate` puede desactivar temporalmente las claves ajenas: se vuelven a activar (ver client.ts)
  await db.$client.execute('PRAGMA foreign_keys = ON')
}
