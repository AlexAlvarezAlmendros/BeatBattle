import {
  type DataEnvelope,
  type EntryStats,
  type JuryQueue,
  JuryQueueQuerySchema,
  type ListenQualify,
  ListenQualifyRequestSchema,
  type ListenStart,
  type MyVotes,
  PlayRequestSchema,
  ReportRequestSchema,
  type Ticker,
  TickerQuerySchema,
  type Vote,
  VoteRequestSchema,
  WeekSlugSchema,
} from '@beatbattle/shared'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { requireSession, requireVerified } from '../../auth/guards'
import { appError } from '../../lib/errors'
import type { VotesService } from './service'

/** Un id con forma de id; el resto da 404 sin tocar la BD. */
function idOf(req: FastifyRequest<{ Params: { id: string } }>): string {
  const id = req.params.id
  if (!/^[\w-]{1,64}$/.test(id)) throw appError('NOT_FOUND', 'No existe esa entrada.')
  return id
}

const userOf = (req: FastifyRequest) => req.user?.id as string

/**
 * Escuchar y votar (§4.10; tareas 5.4–5.8). Votar, escuchar para votar y denunciar piden la cuenta verificada
 * y no bloqueada (`RF-VOTE-06`); contar una escucha es público; las estadísticas, solo del dueño.
 */
export function votesRoutes(app: FastifyInstance, service: VotesService): void {
  type ById = { Params: { id: string } }

  app.post<ById>(
    '/api/entries/:id/listen',
    { preHandler: requireVerified },
    async (req): Promise<DataEnvelope<ListenStart>> => ({
      data: await service.startListen(userOf(req), idOf(req), req.now),
    }),
  )

  app.post<ById>(
    '/api/entries/:id/listen/qualify',
    { preHandler: requireVerified },
    async (req): Promise<DataEnvelope<ListenQualify>> => {
      const { listenId } = ListenQualifyRequestSchema.parse(req.body)
      return { data: await service.qualify(userOf(req), idOf(req), listenId, req.now) }
    },
  )

  app.put<ById>(
    '/api/entries/:id/vote',
    { preHandler: requireVerified },
    async (req): Promise<DataEnvelope<Vote>> => {
      const { stars } = VoteRequestSchema.parse(req.body)
      return { data: await service.vote(userOf(req), idOf(req), stars, req.ip, req.now) }
    },
  )

  app.delete<ById>('/api/entries/:id/vote', { preHandler: requireVerified }, async (req, reply) => {
    await service.unvote(userOf(req), idOf(req), req.now)
    return reply.code(204).send()
  })

  app.post<ById>('/api/entries/:id/report', { preHandler: requireVerified }, async (req, reply) => {
    const input = ReportRequestSchema.parse(req.body)
    await service.report(userOf(req), idOf(req), input, req.now)
    return reply.code(201).send({ data: { ok: true } })
  })

  app.post<ById>('/api/entries/:id/play', async (req, reply) => {
    const { playId } = PlayRequestSchema.parse(req.body)
    await service.play(idOf(req), playId, req.ip, req.now)
    // Cuente o no, la respuesta es la misma: no dice nada del límite ni de la entrada.
    return reply.code(202).send({ data: { ok: true } })
  })

  app.get<ById>(
    '/api/entries/:id/stats',
    { preHandler: requireSession },
    async (req): Promise<DataEnvelope<EntryStats>> => ({ data: await service.stats(userOf(req), idOf(req)) }),
  )

  app.get(
    '/api/jury/queue',
    { preHandler: requireVerified },
    async (req): Promise<DataEnvelope<JuryQueue>> => {
      const { week } = JuryQueueQuerySchema.parse(req.query)
      return { data: await service.juryQueue(userOf(req), week, req.now) }
    },
  )

  app.get<{ Params: { slug: string } }>(
    '/api/weeks/:slug/ticker',
    async (req): Promise<DataEnvelope<Ticker>> => {
      const slug = WeekSlugSchema.safeParse(req.params.slug)
      if (!slug.success) throw appError('NOT_FOUND', 'No existe esa semana.')
      const { since } = TickerQuerySchema.parse(req.query)
      return { data: await service.ticker(slug.data, since, req.now) }
    },
  )

  app.get('/api/me/votes', { preHandler: requireSession }, async (req): Promise<DataEnvelope<MyVotes>> => {
    const { week } = JuryQueueQuerySchema.parse(req.query)
    return { data: await service.myVotes(userOf(req), week, req.now) }
  })
}
