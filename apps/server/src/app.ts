import { randomUUID } from 'node:crypto'
import Fastify, { type FastifyInstance } from 'fastify'
import { createAuth } from './auth/auth'
import { authRoutes } from './auth/routes'
import type { AppConfig } from './config/env'
import type { Db } from './db/client'
import { createMailer, type Mailer } from './email'
import { createRenderer } from './email/render'
import { createServiceEmails } from './email/service'
import { createUnsubscribeLinks } from './email/unsubscribe'
import { type Clock, systemClock } from './lib/clock'
import { uuidv7 } from './lib/ids'
import { type LogStream, loggerOptions } from './lib/logger'
import { healthRoutes } from './modules/health/routes'
import { createHealthService } from './modules/health/service'
import { createCloudinaryStorage } from './modules/storage/cloudinary'
import { storageSpikeRoutes } from './modules/storage/routes'
import { unsubscribeRoutes } from './modules/unsubscribe/routes'
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
  const emails = createServiceEmails({
    db,
    mailer,
    now: () => clock.now(),
    render: createRenderer({ publicUrl: config.publicUrl }),
    unsubscribeUrl: unsubscribeLinks.oneClick,
    dailyLimit: config.mail.dailyLimit,
    newId,
    onSendError: (info) => app.log.warn({ email: info }, 'envío de email fallido'),
  })
  authRoutes(app, createAuth({ config, db, emails, now: () => clock.now() }))

  healthRoutes(app, createHealthService({ db }))
  unsubscribeRoutes(app, { db, secret: config.mail.unsubscribeSecret, newId })
  // Spike de Cloudinary (tarea 1.7): solo fuera de producción.
  if (config.env !== 'production')
    storageSpikeRoutes(app, config.storage ? createCloudinaryStorage(config.storage) : null, {
      webOrigin: config.publicUrl,
    })

  return app
}
