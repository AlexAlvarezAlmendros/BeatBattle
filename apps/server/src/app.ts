import { randomUUID } from 'node:crypto'
import Fastify, { type FastifyInstance } from 'fastify'
import type { AppConfig } from './config/env'
import type { Db } from './db/client'
import { type Clock, systemClock } from './lib/clock'
import { type LogStream, loggerOptions } from './lib/logger'
import { healthRoutes } from './modules/health/routes'
import { createHealthService } from './modules/health/service'
import { registerClock } from './plugins/clock'
import { registerErrorHandling } from './plugins/errors'
import { BODY_LIMIT_BYTES, registerSecurity } from './plugins/security'

export interface AppDeps {
  config: AppConfig
  db: Db
  /** Reloj del servidor; por defecto el del sistema. Los tests pasan `fixedClock`. */
  clock?: Clock
  /** Destino del registro (solo tests: capturar líneas y comprobar que no hay PII). */
  logStream?: LogStream
}

/**
 * Construye la app sin escuchar en ningún puerto: los tests la usan con `inject()` y la función de
 * Vercel (`api/index.ts`) la monta una vez por instancia. Todas las dependencias entran por
 * argumento (guía §4.4): nada de singletons con la BD ni lecturas de `process.env` aquí dentro.
 *
 * Orden: reloj → seguridad → errores → módulos. Los módulos siguen el patrón
 * `modules/<recurso>/{routes,service,repo,schema}.ts`, con `health` como ejemplo.
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

  healthRoutes(app, createHealthService(db))

  return app
}
