import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
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

// ── Email (guía §4.19.3, tarea 2.8) ──────────────────────────────────────────────────────────

/** Preferencias de email de una cuenta: un interruptor por aviso (§2.12.4). Sin fila, todo por defecto. */
export const emailPref = sqliteTable('email_pref', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id),
  mondayFormat: text('monday_format', { enum: ['combined', 'separate'] })
    .notNull()
    .default('combined'),
  dropOn: integer('drop_on', { mode: 'boolean' }).notNull().default(true),
  resultsOn: integer('results_on', { mode: 'boolean' }).notNull().default(true),
  reminderOn: integer('reminder_on', { mode: 'boolean' }).notNull().default(true),
  juryCallOn: integer('jury_call_on', { mode: 'boolean' }).notNull().default(true),
  firstVotesOn: integer('first_votes_on', { mode: 'boolean' }).notNull().default(true),
  labelPickOn: integer('label_pick_on', { mode: 'boolean' }).notNull().default(true),
  progressOn: integer('progress_on', { mode: 'boolean' }).notNull().default(true),
  seasonOn: integer('season_on', { mode: 'boolean' }).notNull().default(true),
  /** Espejo del último consentimiento de marketing (`email_consent`). */
  marketingOn: integer('marketing_on', { mode: 'boolean' }).notNull().default(false),
  updatedAt: integer('updated_at').notNull(),
})

/** Historial de consentimientos (`RF-NOTIF-16`): nunca se sobrescribe; el último manda. */
export const emailConsent = sqliteTable(
  'email_consent',
  {
    id: text('id').primaryKey(),
    userId: text('user_id'),
    subscriberId: text('subscriber_id'),
    purpose: text('purpose', { enum: ['marketing', 'otp_newsletter'] }).notNull(),
    granted: integer('granted', { mode: 'boolean' }).notNull(),
    /** Versión del texto que se mostró (p. ej. `registro-2026-10`). */
    textVersion: text('text_version').notNull(),
    source: text('source', { enum: ['registro', 'ajustes', 'baja', 'formulario'] }).notNull(),
    ipHash: text('ip_hash'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('email_consent_user').on(table.userId, table.purpose, table.createdAt)],
)

/** Alerta de drop sin cuenta (§2.12.3, Fase 3): aquí solo la tabla, para que la cola sepa a quién envía. */
export const emailSubscriber = sqliteTable('email_subscriber', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  status: text('status', { enum: ['pending', 'confirmed', 'unsubscribed'] }).notNull(),
  confirmTokenHash: text('confirm_token_hash'),
  mergedUserId: text('merged_user_id'),
  createdAt: integer('created_at').notNull(),
  confirmedAt: integer('confirmed_at'),
})

export const EMAIL_FAMILIES = ['service', 'battle', 'marketing'] as const
export type EmailFamily = (typeof EMAIL_FAMILIES)[number]

export const OUTBOX_STATUSES = ['queued', 'sending', 'sent', 'failed', 'skipped', 'suppressed'] as const
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number]

/**
 * Cola de salida (patrón *outbox*, §4.19.3): todo email nace aquí, en el mismo `batch` que el hecho que
 * lo provoca. `idempotency_key` única (`RF-NOTIF-02`). Sin cupo, sigue `queued` con `not_before` aplazado.
 */
export const emailOutbox = sqliteTable(
  'email_outbox',
  {
    id: text('id').primaryKey(),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    userId: text('user_id'),
    subscriberId: text('subscriber_id'),
    campaignId: text('campaign_id'),
    /** Para los emails a una dirección sin cuenta ni suscripción (p. ej. `account.deleted`). */
    toAddress: text('to_address'),
    kind: text('kind').notNull(),
    family: text('family', { enum: EMAIL_FAMILIES }).notNull(),
    priority: integer('priority').notNull(),
    /** JSON con los datos del hecho: la plantilla se renderiza al enviar. */
    payload: text('payload').notNull(),
    status: text('status', { enum: OUTBOX_STATUSES }).notNull(),
    skipReason: text('skip_reason'),
    attempts: integer('attempts').notNull().default(0),
    notBefore: integer('not_before').notNull(),
    providerId: text('provider_id'),
    createdAt: integer('created_at').notNull(),
    sentAt: integer('sent_at'),
  },
  (table) => [
    index('email_outbox_due').on(table.status, table.notBefore),
    index('email_outbox_sent').on(table.sentAt),
  ],
)

/** Supresiones (§4.14): solo el hash del email; se conserva tras borrar la cuenta. */
export const emailSuppression = sqliteTable('email_suppression', {
  emailHash: text('email_hash').primaryKey(),
  reason: text('reason', { enum: ['hard_bounce', 'unsubscribed_all', 'manual'] }).notNull(),
  createdAt: integer('created_at').notNull(),
})

/** Estadísticas solo agregadas (sin datos por persona, `RF-NOTIF-12`). */
export const emailStat = sqliteTable(
  'email_stat',
  {
    /** `kind:battle.monday` o `campaign:<id>`. */
    scope: text('scope').notNull(),
    /** `YYYY-MM-DD` (UTC). */
    day: text('day').notNull(),
    /** `sent`, `deferred`, `bounced`, `unsubscribed`, `click:<enlace>`… */
    metric: text('metric').notNull(),
    count: integer('count').notNull(),
  },
  (table) => [primaryKey({ columns: [table.scope, table.day, table.metric] })],
)
