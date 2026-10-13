import {
  type AdminCalendar,
  type AdminWeek,
  type CurrentWeek,
  type DataEnvelope,
  type Download,
  DownloadRequestSchema,
  type PublicWeek,
  RulesAcceptSchema,
  SeenRequestSchema,
  WeekCreateSchema,
  WeekSlugSchema,
  WeekUpdateSchema,
} from '@beatbattle/shared'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { requireSession, requireVerified } from '../../auth/guards'
import { appError } from '../../lib/errors'
import type { WeeksService } from './service'

/** Un slug con formato válido; el resto da 404 sin tocar la BD. */
function slugOf(req: FastifyRequest<{ Params: { slug: string } }>): string {
  const parsed = WeekSlugSchema.safeParse(req.params.slug)
  if (!parsed.success) throw appError('NOT_FOUND', 'No existe esa semana.')
  return parsed.data
}

const viewerOf = (req: FastifyRequest) => req.user?.id ?? null
const actorOf = (req: FastifyRequest) => req.user?.id as string

/**
 * Semanas: el calendario del admin (`/api/admin/weeks`, guarda de admin por prefijo), la semana pública
 * (`/api/weeks/*`), las bases y la descarga (cuenta verificada, `RF-AUTH-01`) y lo ya visto.
 */
export function weeksRoutes(app: FastifyInstance, service: WeeksService): void {
  // ── Admin (3.7) ────────────────────────────────────────────────────────────────────────────────
  app.get('/api/admin/weeks', async (req): Promise<DataEnvelope<AdminCalendar>> => {
    return { data: await service.calendar(req.now) }
  })

  app.post('/api/admin/weeks', async (req, reply): Promise<DataEnvelope<AdminWeek>> => {
    const created = await service.schedule(actorOf(req), WeekCreateSchema.parse(req.body), req.now)
    reply.code(201)
    return { data: created }
  })

  app.get<{ Params: { slug: string } }>(
    '/api/admin/weeks/:slug',
    async (req): Promise<DataEnvelope<AdminWeek>> => {
      return { data: await service.adminWeek(slugOf(req), req.now) }
    },
  )

  app.patch<{ Params: { slug: string } }>(
    '/api/admin/weeks/:slug',
    async (req): Promise<DataEnvelope<AdminWeek>> => {
      return {
        data: await service.update(actorOf(req), slugOf(req), WeekUpdateSchema.parse(req.body), req.now),
      }
    },
  )

  app.delete<{ Params: { slug: string } }>('/api/admin/weeks/:slug', async (req, reply) => {
    await service.unschedule(actorOf(req), slugOf(req), req.now)
    reply.code(204)
  })

  // ── Público (3.8) ──────────────────────────────────────────────────────────────────────────────
  app.get('/api/weeks/current', async (req): Promise<DataEnvelope<CurrentWeek>> => {
    return { data: await service.current(req.now, viewerOf(req)) }
  })

  app.get<{ Params: { slug: string } }>(
    '/api/weeks/:slug',
    async (req): Promise<DataEnvelope<PublicWeek>> => {
      return { data: await service.bySlug(slugOf(req), req.now, viewerOf(req)) }
    },
  )

  // ── Bases y descarga (3.10) ────────────────────────────────────────────────────────────────────
  app.post<{ Params: { slug: string } }>(
    '/api/weeks/:slug/rules',
    { preHandler: requireVerified },
    async (req, reply) => {
      RulesAcceptSchema.parse(req.body)
      await service.acceptRules(actorOf(req), slugOf(req), req.now)
      reply.code(204)
    },
  )

  app.post<{ Params: { slug: string } }>(
    '/api/weeks/:slug/sample/download',
    { preHandler: requireVerified },
    async (req): Promise<DataEnvelope<Download>> => {
      const { kind } = DownloadRequestSchema.parse(req.body ?? {})
      return { data: await service.download(actorOf(req), slugOf(req), kind, req.now) }
    },
  )

  // ── Lo ya visto (3.11) ─────────────────────────────────────────────────────────────────────────
  app.post('/api/me/seen', { preHandler: requireSession }, async (req, reply) => {
    const { ref } = SeenRequestSchema.parse(req.body)
    await service.markDropSeen(actorOf(req), ref, req.now)
    reply.code(204)
  })
}
