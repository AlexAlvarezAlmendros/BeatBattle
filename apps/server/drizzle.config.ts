import { defineConfig } from 'drizzle-kit'

/**
 * drizzle-kit solo genera migraciones SQL a partir del esquema (`pnpm db:generate`); no se conecta a
 * ninguna BD. Las migraciones se aplican al arrancar (`src/db/migrate.ts`) y en CI antes de
 * promover a producción (guía §4.15).
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
})
