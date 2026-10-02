import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * Esquema de Drizzle (guía §4.11). Convenciones:
 * - instantes en ms Unix (UTC) como `integer`; ids uuid v7 como `text` (`lib/ids.ts`);
 * - columnas en `snake_case` en SQL y `camelCase` en TS;
 * - sin `ON DELETE CASCADE`: libSQL por HTTP no mantiene `foreign_keys`, así que los borrados son
 *   explícitos y en un único `batch` (`db/batch.ts`);
 * - cada cambio va con su migración: `pnpm --filter @beatbattle/server db:generate`.
 * Las tablas de Better Auth (Fase 2) se generan con su CLI y viven aparte.
 */

/**
 * Contadores de rate limit (guía §4.11, §4.13): en serverless no hay memoria compartida, así que
 * viven en la BD. Ventana fija por clave; `modules/rateLimit` la incrementa o reinicia con un único
 * UPSERT atómico.
 */
export const appRateLimit = sqliteTable('app_rate_limit', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  resetAt: integer('reset_at').notNull(),
})
