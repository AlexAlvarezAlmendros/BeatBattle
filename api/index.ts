// Función de Vercel (guía §4.15): toda la API (/api/*) la atiende la misma app de Fastify.
// Escrito, sin desplegar: se valida al crear el proyecto en Vercel (Fase 10).
import type { IncomingMessage, ServerResponse } from 'node:http'
import { buildApp } from '../apps/server/src/app'

// Se inicializa una vez por instancia (arranque en frío).
const ready = (async () => {
  const app = buildApp()
  await app.ready()
  return app
})()

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const app = await ready
  app.server.emit('request', req, res)
}
