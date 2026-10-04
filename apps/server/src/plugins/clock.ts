import type { FastifyInstance } from 'fastify'
import { type AppConfig, EnvError, TEST_CLOCK_IN_PRODUCTION } from '../config/env'
import { type Clock, parseTestNow, TEST_NOW_HEADER } from '../lib/clock'
import { validationFailed } from '../lib/errors'

declare module 'fastify' {
  interface FastifyRequest {
    /** Instante de la petición en ms Unix (UTC). Toda lógica que necesite la hora usa este valor. */
    now: number
  }
}

/**
 * Fija `request.now` al empezar cada petición (guía §4.12). Con `testClock` (`BB_TEST_CLOCK=1`) la
 * cabecera `x-bb-test-now` lo sustituye; sin la guarda la cabecera se ignora por completo. Se
 * registra antes que cualquier otro hook.
 *
 * El reloj de prueba nunca llega a producción: `loadEnv` lo rechaza y, por si una configuración se
 * construye por otro camino, aquí se vuelve a comprobar y la app no se monta (`EnvError`).
 */
export function registerClock(
  app: FastifyInstance,
  clock: Clock,
  config: Pick<AppConfig, 'env' | 'testClock'>,
): void {
  if (config.testClock && config.env === 'production') throw new EnvError([TEST_CLOCK_IN_PRODUCTION])
  const { testClock } = config
  app.decorateRequest('now', 0)
  app.addHook('onRequest', async (req) => {
    req.now = clock.now()
    if (!testClock) return
    const raw = req.headers[TEST_NOW_HEADER]
    if (raw === undefined) return
    const value = Array.isArray(raw) ? raw[0] : raw
    const ms = value === undefined ? null : parseTestNow(value)
    if (ms === null)
      throw validationFailed([
        {
          path: `headers.${TEST_NOW_HEADER}`,
          message: 'Debe ser ms Unix o una fecha ISO 8601 con zona horaria.',
        },
      ])
    req.now = ms
  })
}
