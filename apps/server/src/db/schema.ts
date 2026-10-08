import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { user } from './auth-schema'

/** Las tablas de Better Auth (`user`, `session`, `account`, `verification`, `rate_limit`), generadas. */
export * from './auth-schema'

/**
 * Esquema de Drizzle (guía §4.11). Convenciones:
 * - instantes en ms Unix (UTC) como `integer`; ids uuid v7 como `text` (`lib/ids.ts`);
 * - columnas en `snake_case` en SQL y `camelCase` en TS;
 * - sin `ON DELETE CASCADE`: libSQL por HTTP no mantiene `foreign_keys`, así que los borrados son
 *   explícitos y en un único `batch` (`db/batch.ts`);
 * - cada cambio va con su migración: `pnpm --filter @beatbattle/server db:generate`.
 * Las tablas de Better Auth se generan con su CLI (`auth:schema`) en `auth-schema.ts`; los datos de juego
 * van en tablas propias, nunca en `user` (§4.9).
 */

/**
 * Contadores de rate limit (guía §4.11, §4.13): en serverless no hay memoria compartida, así que
 * viven en la BD. Ventana fija por clave; `lib/rateLimit` la incrementa o reinicia con un único
 * UPSERT atómico.
 */
export const appRateLimit = sqliteTable('app_rate_limit', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  resetAt: integer('reset_at').notNull(),
})

/** Colores de acento del perfil: solo la paleta (§2.3, §3.2). */
export const ACCENTS = ['red', 'white', 'wine'] as const
export type Accent = (typeof ACCENTS)[number]

/**
 * Perfil de productor (guía §4.11): lo público y lo de juego de cada cuenta, aparte de `user`. Se crea
 * con la cuenta (hook de Better Auth, tarea 2.4). `card_number` es el orden de alta («#0042»).
 */
export const producerProfile = sqliteTable('producer_profile', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id),
  cardNumber: integer('card_number').notNull().unique(),
  bio: text('bio'),
  city: text('city'),
  /** JSON: instagram, soundcloud, youtube, spotify, beatstars. */
  links: text('links').notNull().default('{}'),
  accent: text('accent', { enum: ACCENTS }).notNull().default('red'),
  avatarPublicId: text('avatar_public_id'),
  /** JSON: hasta 3 ids de logro (Fase 7). */
  showcase: text('showcase').notNull().default('[]'),
  otpAffiliate: integer('otp_affiliate', { mode: 'boolean' }).notNull().default(false),
  /** Caché de la suma de `xp_event` (Fase 7). */
  xp: integer('xp').notNull().default(0),
  levelSeen: integer('level_seen').notNull().default(1),
  seriousMode: integer('serious_mode', { mode: 'boolean' }).notNull().default(false),
  usernameChangedAt: integer('username_changed_at'),
  createdAt: integer('created_at').notNull(),
})

/** Nombre anterior → cuenta, durante 30 días tras un cambio de `username` (`RF-PRF-03`). */
export const usernameRedirect = sqliteTable('username_redirect', {
  old: text('old').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id),
  expiresAt: integer('expires_at').notNull(),
})
