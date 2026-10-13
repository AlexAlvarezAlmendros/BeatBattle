import { ACCENTS, type Accent } from '@beatbattle/shared'
import { sql } from 'drizzle-orm'
import {
  blob,
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
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

/** Colores de acento del perfil: solo la paleta (§2.3, §3.2); los define `@beatbattle/shared`. */
export { ACCENTS, type Accent }

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

// ── Semanas y samples (guía §2.1, §2.4, §4.11, tarea 3.3) ───────────────────────────────────

/**
 * Sample de una semana (§2.4). Lo sube el admin; duración, bytes, sonoridad y forma de onda los mide el
 * servidor (§4.8.4), nunca el navegador. Los `public_id` son los de §4.8.1 (`<prefijo>/samples/<id>/…`).
 */
export const sample = sqliteTable('sample', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  credits: text('credits').notNull(),
  origin: text('origin'),
  licenseText: text('license_text').notNull(),
  bpm: real('bpm'),
  musicalKey: text('musical_key'),
  genreHint: text('genre_hint'),
  durationMs: integer('duration_ms').notNull(),
  bytes: integer('bytes').notNull(),
  format: text('format').notNull(),
  audioPublicId: text('audio_public_id').notNull(),
  stemsPublicId: text('stems_public_id'),
  coverPublicId: text('cover_public_id').notNull(),
  /** 1000 bins mín/máx en `Int8` (2000 bytes). */
  peaks: blob('peaks', { mode: 'buffer' }).notNull(),
  loudnessLufs: real('loudness_lufs'),
  /** JSON: 8 × `{ startMs, endMs }` para el kit de la semana (§3.7.6). */
  chops: text('chops').notNull().default('[]'),
  createdBy: text('created_by').notNull(),
  createdAt: integer('created_at').notNull(),
})

/**
 * Semana (§2.1). Su fase no se guarda: se deriva de los tres instantes y de `now` (`phaseOf`,
 * `RF-DROP-01`). Los instantes los calcula `scheduleWeek` al programarla, en `Europe/Madrid`.
 */
export const week = sqliteTable(
  'week',
  {
    id: text('id').primaryKey(),
    /** #N desde el lanzamiento, por orden de calendario. */
    number: integer('number').notNull().unique(),
    /** `2026-w41`. */
    slug: text('slug').notNull().unique(),
    /** `2026-T4`. */
    seasonId: text('season_id').notNull(),
    sampleId: text('sample_id')
      .notNull()
      .references(() => sample.id),
    challenge: text('challenge'),
    blind: integer('blind', { mode: 'boolean' }).notNull().default(true),
    golden: integer('golden', { mode: 'boolean' }).notNull().default(false),
    rulesVersion: integer('rules_version').notNull(),
    startsAt: integer('starts_at').notNull(),
    submitEndsAt: integer('submit_ends_at').notNull(),
    voteEndsAt: integer('vote_ends_at').notNull(),
    sealedAt: integer('sealed_at'),
    resultRevision: integer('result_revision').notNull().default(0),
    createdBy: text('created_by').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('week_starts_at').on(table.startsAt),
    check(
      'week_boundaries',
      sql`${table.startsAt} < ${table.submitEndsAt} AND ${table.submitEndsAt} <= ${table.voteEndsAt}`,
    ),
  ],
)

/** Bases aceptadas por cuenta y semana (`RF-DROP-06`), con la versión que se aceptó. */
export const rulesAcceptance = sqliteTable(
  'rules_acceptance',
  {
    userId: text('user_id').notNull(),
    weekId: text('week_id').notNull(),
    rulesVersion: integer('rules_version').notNull(),
    acceptedAt: integer('accepted_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.weekId] })],
)

export const SAMPLE_DOWNLOAD_KINDS = ['original', 'stems'] as const
export type SampleDownloadKind = (typeof SAMPLE_DOWNLOAD_KINDS)[number]

/** Descargas del sample por cuenta, semana y tipo (`RF-DROP-08`): la primera y cuántas. */
export const sampleDownload = sqliteTable(
  'sample_download',
  {
    userId: text('user_id').notNull(),
    weekId: text('week_id').notNull(),
    kind: text('kind', { enum: SAMPLE_DOWNLOAD_KINDS }).notNull(),
    count: integer('count').notNull(),
    firstAt: integer('first_at').notNull(),
    lastAt: integer('last_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.weekId, table.kind] }),
    index('sample_download_week').on(table.weekId),
  ],
)

export const SEEN_FLAG_KINDS = ['drop', 'ceremony', 'season_champion'] as const
export type SeenFlagKind = (typeof SEEN_FLAG_KINDS)[number]

/** Lo que una cuenta ya ha visto una vez: la revelación del drop (`RF-DROP-11`), la ceremonia… */
export const seenFlag = sqliteTable(
  'seen_flag',
  {
    userId: text('user_id').notNull(),
    kind: text('kind', { enum: SEEN_FLAG_KINDS }).notNull(),
    ref: text('ref').notNull(),
    seenAt: integer('seen_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.kind, table.ref] })],
)

/** *Lease* de las tareas programadas (§4.12): dos ejecuciones de la misma tarea no se pisan. */
export const jobLease = sqliteTable('job_lease', {
  name: text('name').primaryKey(),
  holder: text('holder').notNull(),
  expiresAt: integer('expires_at').notNull(),
})

/** Registro de las acciones de admin (`RF-ADM-05`). Nunca se borra ni se edita. */
export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    actorId: text('actor_id').notNull(),
    action: text('action').notNull(),
    target: text('target').notNull(),
    reason: text('reason'),
    /** JSON con lo que cambió. */
    payload: text('payload'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('audit_log_created').on(table.createdAt)],
)

// ── Entradas (guía §2.5, §4.8, §4.11, tarea 4.3) ───────────────────────────────────────────

export const UPLOAD_INTENT_KINDS = ['entry', 'entryCover'] as const
export type UploadIntentKind = (typeof UPLOAD_INTENT_KINDS)[number]
export const UPLOAD_INTENT_STATUSES = ['pending', 'done', 'expired', 'failed'] as const
export type UploadIntentStatus = (typeof UPLOAD_INTENT_STATUSES)[number]

/**
 * Lo firmado para una subida (§4.8.2): el `public_id` que fija el servidor y lo declarado. Caduca a la
 * hora, como la firma de Cloudinary; al registrar la entrada pasa a `done` y no se puede volver a usar.
 * `entryId`: la entrada cuyo audio se sustituye (`RF-ENT-08`) o cuya portada se cambia.
 */
export const uploadIntent = sqliteTable(
  'upload_intent',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    kind: text('kind', { enum: UPLOAD_INTENT_KINDS }).notNull(),
    weekId: text('week_id').notNull(),
    entryId: text('entry_id'),
    publicId: text('public_id').notNull().unique(),
    status: text('status', { enum: UPLOAD_INTENT_STATUSES }).notNull(),
    declaredBytes: integer('declared_bytes'),
    declaredDurationMs: integer('declared_duration_ms'),
    expiresAt: integer('expires_at').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('upload_intent_user').on(table.userId),
    index('upload_intent_expires').on(table.expiresAt),
  ],
)

export const ENTRY_STATUSES = ['processing', 'active', 'hidden', 'withdrawn', 'disqualified'] as const
export type EntryRowStatus = (typeof ENTRY_STATUSES)[number]

/**
 * Entrada de una semana (§2.5). Duración, bytes, formato, sonoridad, pico real y onda los mide el servidor
 * (`RF-ENT-05`). El `public_id` del audio no lleva el id del usuario (`RF-ENT-04`). Una sola activa por
 * cuenta y semana (`RF-ENT-01`, índice parcial); alias y número de recibo, únicos en la semana.
 */
export const entry = sqliteTable(
  'entry',
  {
    id: text('id').primaryKey(),
    weekId: text('week_id')
      .notNull()
      .references(() => week.id),
    /** La cuenta; tras borrarla, en una semana sellada, `deleted:<id de la entrada>` (`RF-PRF-04`). */
    userId: text('user_id').notNull(),
    alias: text('alias').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    bpm: real('bpm'),
    musicalKey: text('musical_key'),
    daw: text('daw'),
    /** JSON: hasta 3 géneros de la lista del sello. */
    tags: text('tags').notNull().default('[]'),
    audioPublicId: text('audio_public_id').notNull().unique(),
    etag: text('etag').notNull(),
    format: text('format').notNull(),
    bytes: integer('bytes').notNull(),
    durationMs: integer('duration_ms').notNull(),
    /** 1000 bins mín/máx en `Int8` (2000 bytes); `null` mientras está en `processing`. */
    peaks: blob('peaks', { mode: 'buffer' }),
    loudnessLufs: real('loudness_lufs'),
    truePeakDb: real('true_peak_db'),
    hotStartMs: integer('hot_start_ms'),
    coverPublicId: text('cover_public_id'),
    coverSeed: integer('cover_seed').notNull(),
    /** Correlativo de la semana (§2.12.1): se fija al crearla y no se reutiliza. */
    receiptNumber: integer('receipt_number').notNull(),
    status: text('status', { enum: ENTRY_STATUSES }).notNull(),
    statusReason: text('status_reason'),
    playCount: integer('play_count').notNull().default(0),
    /** Marcada por `etag` igual al de otra entrada (`RF-ENT-11`). */
    duplicateOf: text('duplicate_of'),
    submittedAt: integer('submitted_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('entry_one_per_week')
      .on(table.weekId, table.userId)
      .where(sql`${table.status} IN ('processing', 'active', 'hidden')`),
    uniqueIndex('entry_alias_week').on(table.weekId, table.alias),
    uniqueIndex('entry_receipt_week').on(table.weekId, table.receiptNumber),
    index('entry_user').on(table.userId),
    index('entry_etag').on(table.etag),
  ],
)

/**
 * Voto de 1 a 5 estrellas (§2.7). En la Fase 4 solo el esquema: sustituir el audio pide que la entrada no
 * tenga votos (`RF-ENT-08`) y retirarla los borra (`RF-ENT-09`). La lógica del voto llega con la Fase 5.
 */
export const vote = sqliteTable(
  'vote',
  {
    userId: text('user_id').notNull(),
    entryId: text('entry_id').notNull(),
    weekId: text('week_id').notNull(),
    stars: integer('stars').notNull(),
    voided: integer('voided', { mode: 'boolean' }).notNull().default(false),
    voidedReason: text('voided_reason'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.entryId] }),
    index('vote_week').on(table.weekId),
    index('vote_entry').on(table.entryId),
    check('vote_stars', sql`${table.stars} BETWEEN 1 AND 5`),
  ],
)
