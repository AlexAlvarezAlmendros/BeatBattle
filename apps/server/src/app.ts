import { randomUUID } from 'node:crypto'
import Fastify, { type FastifyInstance } from 'fastify'
import { createAuth } from './auth/auth'
import { registerAdminGuard } from './auth/guards'
import { authRoutes } from './auth/routes'
import type { AppConfig } from './config/env'
import type { Db } from './db/client'
import { createMailer, type Mailer } from './email'
import type { DrainDeps } from './email/outbox'
import { createRenderer } from './email/render'
import { createServiceEmails } from './email/service'
import { createUnsubscribeLinks } from './email/unsubscribe'
import { type Clock, systemClock } from './lib/clock'
import { uuidv7 } from './lib/ids'
import { type LogStream, loggerOptions } from './lib/logger'
import { createRateLimiter } from './lib/rateLimit'
import { type AudioMeasurement, measureAudio } from './media/measure'
import { accountRoutes } from './modules/account/routes'
import { alertsRoutes } from './modules/alerts/routes'
import { createAlertsService } from './modules/alerts/service'
import { cronRoutes } from './modules/cron/routes'
import { emailPrefsRoutes } from './modules/emailPrefs/routes'
import { entriesRoutes } from './modules/entries/routes'
import { createEntriesService } from './modules/entries/service'
import { healthRoutes } from './modules/health/routes'
import { createHealthService } from './modules/health/service'
import { meRoutes } from './modules/me/routes'
import { sessionsRoutes } from './modules/me/sessions'
import { profileRoutes } from './modules/profile/routes'
import { samplesRoutes } from './modules/samples/routes'
import { createSamplesService } from './modules/samples/service'
import { createCloudinaryStorage, type ImageStorage } from './modules/storage/cloudinary'
import {
  createCloudinaryEntryStorage,
  createDiskEntryStorage,
  type EntryStorage,
} from './modules/storage/entries'
import { fakeStorageRoutes } from './modules/storage/fakeRoutes'
import { storageSpikeRoutes } from './modules/storage/routes'
import {
  createCloudinarySampleStorage,
  createDiskSampleStorage,
  type DiskSampleStorage,
  type SampleStorage,
} from './modules/storage/samples'
import { testingRoutes } from './modules/testing/routes'
import { unsubscribeRoutes } from './modules/unsubscribe/routes'
import { uploadsRoutes } from './modules/uploads/routes'
import { countdownRoutes } from './modules/weeks/countdownRoute'
import { weeksRoutes } from './modules/weeks/routes'
import { createWeeksService } from './modules/weeks/service'
import { registerClock } from './plugins/clock'
import { registerErrorHandling } from './plugins/errors'
import { BODY_LIMIT_BYTES, registerSecurity } from './plugins/security'

declare module 'fastify' {
  interface FastifyInstance {
    /** Transporte y enlaces de baja (§4.19): los usan los módulos que envían email. */
    email: { mailer: Mailer | null; unsubscribeLinks: ReturnType<typeof createUnsubscribeLinks> }
  }
}

export interface AppDeps {
  config: AppConfig
  db: Db
  /** Reloj del servidor; por defecto el del sistema. Los tests pasan `fixedClock`. */
  clock?: Clock
  /** Destino del registro (solo tests: capturar líneas y comprobar que no hay PII). */
  logStream?: LogStream
  /**
   * Transporte de email; por defecto, el de la configuración (§4.19.1). Los tests pasan uno en memoria
   * para leer lo enviado; `null`, sin transporte (los emails se quedan en cola).
   */
  mailer?: Mailer | null
  /** Imágenes (avatares, §4.8); por defecto, Cloudinary si está configurado. Los tests pasan una falsa. */
  images?: ImageStorage | null
  /**
   * Samples (§4.8, Fase 3); por defecto, el falso en disco con `BB_FAKE_STORAGE` o Cloudinary si está
   * configurado. Los tests pasan uno en una carpeta temporal.
   */
  samples?: SampleStorage | null
  /** Almacenamiento de las entradas; por defecto, sobre el de los samples (falso) o Cloudinary. */
  entryStorage?: EntryStorage | null
  /** Presupuesto de la medición de una entrada antes de dejarla en `processing` (tests). */
  measureBudgetMs?: number
  /** Medición del audio (§4.8.4); por defecto, ffmpeg. */
  measure?: (source: ReadableStream<Uint8Array>) => Promise<AudioMeasurement>
}

/**
 * Construye la app sin escuchar en ningún puerto: los tests la usan con `inject()` y la función de
 * Vercel (`api/index.ts`) la monta una vez por instancia. Todas las dependencias entran por
 * argumento (guía §4.4): nada de singletons con la BD ni lecturas de `process.env` aquí dentro.
 *
 * Orden: reloj → seguridad → errores → módulos.
 *
 * Patrón único de módulo (§4.18), con `health` como ejemplo:
 * - `modules/<recurso>/schema.ts`: contratos (de `@beatbattle/shared`) y esquemas internos.
 * - `repo.ts`: solo SQL, funciones que reciben la BD: `xRepo.find(db, …)`.
 * - `service.ts`: `createXService(deps)` con un objeto de dependencias (`{ db, clock, mailer… }`): las
 *   guarda y no sabe nada de HTTP; el instante de la petición entra como argumento (`req.now`).
 * - `routes.ts`: `xRoutes(app, service)`; traduce la petición, llama al servicio y devuelve el sobre.
 * Lo transversal sin rutas (rate limit, auditoría…) va en `lib/` con el mismo patrón de fábrica:
 * `createRateLimiter({ db })`.
 */
export function buildApp(deps: AppDeps): FastifyInstance {
  const { config, db } = deps
  const clock = deps.clock ?? systemClock

  const app = Fastify({
    bodyLimit: BODY_LIMIT_BYTES,
    trustProxy: config.trustProxy,
    logger: loggerOptions(config.logLevel, deps.logStream),
    // ids aleatorios: el 500 los devuelve y uno secuencial revelaría el volumen de peticiones
    genReqId: () => randomUUID(),
  })

  registerClock(app, clock, config)
  registerSecurity(app, config)
  registerErrorHandling(app)

  const mailer = deps.mailer === undefined ? createMailer(config.mail) : deps.mailer
  const unsubscribeLinks = createUnsubscribeLinks({
    publicUrl: config.publicUrl,
    secret: config.mail.unsubscribeSecret,
  })
  app.decorate('email', { mailer, unsubscribeLinks })
  app.addHook('onClose', async () => {
    await mailer?.close()
  })

  const newId = () => uuidv7(clock)
  const drainDeps: DrainDeps = {
    db,
    mailer,
    now: () => clock.now(),
    render: createRenderer({ publicUrl: config.publicUrl }),
    unsubscribeUrl: unsubscribeLinks.oneClick,
    dailyLimit: config.mail.dailyLimit,
    onSendError: (info) => app.log.warn({ email: info }, 'envío de email fallido'),
  }
  const emails = createServiceEmails({ ...drainDeps, newId })
  authRoutes(app, createAuth({ config, db, emails, now: () => clock.now(), newId }))
  registerAdminGuard(app)

  healthRoutes(app, createHealthService({ db }))
  unsubscribeRoutes(app, { db, secret: config.mail.unsubscribeSecret, newId })
  emailPrefsRoutes(app, { db, secret: config.auth.secret, newId })
  sessionsRoutes(app, { db })
  const rateLimiter = createRateLimiter({ db })
  const storage = config.storage ? createCloudinaryStorage(config.storage) : null
  const images = deps.images === undefined ? storage : deps.images
  meRoutes(app, { db, images })
  profileRoutes(app, { db, images, rateLimiter })
  accountRoutes(app, { db, images, emails, rateLimiter })

  const samples =
    deps.samples !== undefined
      ? deps.samples
      : config.fakeStorageDir
        ? createDiskSampleStorage({ root: config.fakeStorageDir, baseUrl: '', secret: config.auth.secret })
        : config.storage
          ? createCloudinarySampleStorage(config.storage)
          : null
  if (samples && 'put' in samples && config.env !== 'production')
    fakeStorageRoutes(app, samples as DiskSampleStorage)
  samplesRoutes(
    app,
    createSamplesService({
      db,
      storage: samples,
      measure: deps.measure ?? ((source) => measureAudio(source)),
      newId,
    }),
  )
  const entryStorage =
    deps.entryStorage !== undefined
      ? deps.entryStorage
      : samples && 'put' in samples
        ? createDiskEntryStorage(samples as DiskSampleStorage, deps.measure)
        : config.storage
          ? createCloudinaryEntryStorage(config.storage, deps.measure)
          : null
  const entries = createEntriesService({
    db,
    storage: entryStorage,
    newId,
    publicUrl: config.publicUrl,
    measureBudgetMs: deps.measureBudgetMs,
    images,
  })
  uploadsRoutes(app, { images, entries: entryStorage ? entries : null, rateLimiter, newId })
  entriesRoutes(app, entries)
  const weeks = createWeeksService({ db, storage: samples, newId })
  weeksRoutes(app, weeks)
  countdownRoutes(app, { db })
  const alerts = createAlertsService({ db, emails, publicUrl: config.publicUrl, newId })
  alertsRoutes(app, { service: alerts, rateLimiter, secret: config.auth.secret })
  cronRoutes(app, {
    db,
    storage: samples,
    publicUrl: config.publicUrl,
    newId,
    cronSecret: config.cronSecret,
    drain: drainDeps,
    weeks,
    alerts,
    entries,
    entryStorage,
  })
  // El buzón de los E2E: solo en test, nunca en desarrollo ni en producción.
  if (config.env === 'test') testingRoutes(app, mailer, db)
  // Spike de Cloudinary (tarea 1.7): solo fuera de producción.
  if (config.env !== 'production')
    storageSpikeRoutes(app, storage, {
      webOrigin: config.publicUrl,
    })

  return app
}
