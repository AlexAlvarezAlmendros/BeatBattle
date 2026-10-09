import { countdownOf, LAST_HOUR_MS } from '@beatbattle/rules'
import { WeekSlugSchema } from '@beatbattle/shared'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { Db } from '../../db/client'
import { week } from '../../db/schema'
import { countdownGif } from '../../media/countdownGif'

/** Caché de la cuenta atrás (§4.19.5): 30 s por semana; cambia entre dos peticiones separadas un minuto. */
const CACHE_MS = 30_000

/**
 * `GET /api/email/countdown/:slug.gif` (§4.19.5, `RF-NOTIF-14`; tarea 3.14): 60 fotogramas desde el
 * instante de la petición hasta el cierre en curso (envíos en `open`, votos en `voting`). Fuera de esas
 * fases, o con una semana que no existe, la imagen de ceros: un email viejo nunca da error.
 */
export function countdownRoutes(app: FastifyInstance, deps: { db: Db }): void {
  const cache = new Map<string, { at: number; gif: Uint8Array }>()
  app.get<{ Params: { file: string } }>('/api/email/countdown/:file', async (req, reply) => {
    const slug = req.params.file.replace(/\.gif$/, '')
    let target = req.now
    if (WeekSlugSchema.safeParse(slug).success) {
      const [row] = await deps.db.select().from(week).where(eq(week.slug, slug))
      const countdown = row ? countdownOf(row, req.now) : null
      if (countdown) target = countdown.target
    }
    const key = `${slug}:${target}`
    let entry = cache.get(key)
    if (!entry || req.now - entry.at >= CACHE_MS) {
      entry = { at: req.now, gif: countdownGif({ now: req.now, target, lastHourMs: LAST_HOUR_MS }) }
      cache.set(key, entry)
      if (cache.size > 64) cache.delete(cache.keys().next().value as string)
    }
    reply.header('content-type', 'image/gif')
    reply.header('cache-control', `public, max-age=${CACHE_MS / 1000}`)
    return reply.send(Buffer.from(entry.gif))
  })
}
