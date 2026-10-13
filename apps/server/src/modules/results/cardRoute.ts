import { createHmac, timingSafeEqual } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { Db } from '../../db/client'
import { entry, result, sample, user, week } from '../../db/schema'
import { appError } from '../../lib/errors'
import { resultCardPng } from '../../media/resultCard'

/**
 * `GET /api/og/result/:slug/:userId?sig=` (§4.19.5, `RF-NOTIF-14`; tarea 6.10): la tarjeta de resultado de
 * quien participó en una semana sellada, para su Lunes de batalla. Es personal: firmada con HMAC sobre la
 * semana y la cuenta, así nadie recorre las de otros; sin firma válida, 403. Con firma pero sin resultado (la
 * semana sin sellar, o sin entrada clasificada de esa cuenta), 404: nada de la semana sale antes del sellado
 * (`RF-PLAY-05`). La petición no se registra (`RF-NOTIF-12`).
 */

/** Caché corta: un re-sellado cambia la tarjeta (`RF-RES-06`). */
const CACHE_SECONDS = 60 * 60

const SLUG = /^\d{4}-w\d{2}$/
const ID = /^[\w-]{1,64}$/

function signature(secret: string, slug: string, userId: string): string {
  return createHmac('sha256', secret).update(`result|${slug}|${userId}`).digest('base64url')
}

/** La URL firmada de la tarjeta (la pone el servidor en el email). */
export function resultCardUrl(publicUrl: string, secret: string, slug: string, userId: string): string {
  return `${publicUrl}/api/og/result/${slug}/${userId}?sig=${signature(secret, slug, userId)}`
}

export function resultCardRoutes(app: FastifyInstance, deps: { db: Db; secret: string }): void {
  app.get<{ Params: { slug: string; userId: string }; Querystring: { sig?: string } }>(
    '/api/og/result/:slug/:userId',
    { logLevel: 'silent' },
    async (req, reply) => {
      const { slug, userId } = req.params
      if (!SLUG.test(slug) || !ID.test(userId)) throw appError('FORBIDDEN', 'Firma no válida.')
      const given = Buffer.from(req.query.sig ?? '')
      const expected = Buffer.from(signature(deps.secret, slug, userId))
      if (given.length !== expected.length || !timingSafeEqual(given, expected))
        throw appError('FORBIDDEN', 'Firma no válida.')
      const [row] = await deps.db
        .select({ week, result, entry, sampleTitle: sample.title })
        .from(week)
        .innerJoin(sample, eq(sample.id, week.sampleId))
        .innerJoin(entry, and(eq(entry.weekId, week.id), eq(entry.userId, userId)))
        .innerJoin(
          result,
          and(
            eq(result.weekId, week.id),
            eq(result.revision, week.resultRevision),
            eq(result.entryId, entry.id),
          ),
        )
        .where(eq(week.slug, slug))
        .limit(1)
      if (!row || row.week.sealedAt === null) throw appError('NOT_FOUND', 'No hay resultado.')
      const [person] = await deps.db
        .select({ username: user.username, displayUsername: user.displayUsername, name: user.name })
        .from(user)
        .where(eq(user.id, userId))
      const png = await resultCardPng({
        weekNumber: row.week.number,
        sampleTitle: row.sampleTitle,
        entryTitle: row.entry.title,
        alias: row.entry.alias,
        producer: person ? person.displayUsername || person.username || person.name : null,
        position: row.result.position,
        scoreMilli: row.result.scoreMilli,
        votes: row.result.votes,
        histogram: JSON.parse(row.result.histogram) as [number, number, number, number, number],
        corrected: row.week.resultRevision > 1,
      })
      reply.header('content-type', 'image/png')
      reply.header('cache-control', `public, max-age=${CACHE_SECONDS}`)
      return reply.send(Buffer.from(png))
    },
  )
}
