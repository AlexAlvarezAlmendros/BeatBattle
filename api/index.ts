// Función de Vercel (guía §4.15): toda la API (/api/*) la atiende la misma app de Fastify.
// Escrito, sin desplegar: se valida al crear el proyecto en Vercel (Fase 10).
import type { IncomingMessage, ServerResponse } from 'node:http'
import { buildApp } from '../apps/server/src/app'
import { loadEnv } from '../apps/server/src/config/env'
import { createDb } from '../apps/server/src/db/client'

// Se inicializa una vez por instancia (arranque en frío): entorno, BD y app.
const ready = (async () => {
  // En Vercel todo es producción (también las previews): así la guarda de §4.12 impide el reloj de
  // prueba aunque alguien defina BB_TEST_CLOCK. Detrás de su proxy la IP real llega en
  // X-Forwarded-For (Vercel la reescribe, no se puede falsear).
  const config = loadEnv({ TRUST_PROXY: '1', ...process.env, NODE_ENV: 'production' })
  const db = await createDb(config.databaseUrl, config.databaseAuthToken)
  const app = buildApp({ config, db })
  await app.ready()
  return app
})()

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const app = await ready
  app.server.emit('request', req, res)
}
