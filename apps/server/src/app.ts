import Fastify, { type FastifyInstance } from 'fastify'

/**
 * Construye la app de Fastify sin escuchar en ningún puerto, para que los tests usen `inject`
 * y la función de Vercel la reutilice (guía §4.15). Las bases transversales llegan en 0.16–0.17.
 */
export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false })
  app.get('/api/health', async () => ({ data: { status: 'ok' as const } }))
  return app
}
