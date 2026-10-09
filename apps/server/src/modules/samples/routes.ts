import {
  type AdminSample,
  type DataEnvelope,
  SampleCreateSchema,
  SampleSignRequestSchema,
  type SampleUpdate,
  SampleUpdateSchema,
  type SignedUpload,
} from '@beatbattle/shared'
import type { FastifyInstance } from 'fastify'
import type { SamplesService } from './service'

/**
 * `/api/admin/samples` (§2.14, tarea 3.6). La guarda de admin la pone `registerAdminGuard` a todo lo que
 * cuelga de `/api/admin` (`RF-AUTH-03`).
 */
export function samplesRoutes(app: FastifyInstance, service: SamplesService): void {
  const actor = (req: { user?: { id: string } | null }) => req.user?.id as string

  app.post(
    '/api/admin/samples/sign',
    async (req): Promise<DataEnvelope<{ sampleId: string; upload: SignedUpload }>> => {
      return { data: service.sign(SampleSignRequestSchema.parse(req.body), req.now) }
    },
  )

  app.get('/api/admin/samples', async (): Promise<DataEnvelope<AdminSample[]>> => {
    return { data: await service.list() }
  })

  app.get<{ Params: { id: string } }>(
    '/api/admin/samples/:id',
    async (req): Promise<DataEnvelope<AdminSample>> => {
      return { data: await service.get(req.params.id) }
    },
  )

  app.post('/api/admin/samples', async (req, reply): Promise<DataEnvelope<AdminSample>> => {
    const created = await service.create(actor(req), SampleCreateSchema.parse(req.body), req.now)
    reply.code(201)
    return { data: created }
  })

  app.patch<{ Params: { id: string } }>(
    '/api/admin/samples/:id',
    async (req): Promise<DataEnvelope<AdminSample>> => {
      const patch: SampleUpdate = SampleUpdateSchema.parse(req.body)
      return { data: await service.update(actor(req), req.params.id, patch, req.now) }
    },
  )

  app.delete<{ Params: { id: string } }>('/api/admin/samples/:id', async (req, reply) => {
    const { external } = await service.remove(actor(req), req.params.id, req.now)
    await external().catch((error: unknown) =>
      req.log.warn(
        { err: error, sampleId: req.params.id },
        'ficheros del sample sin borrar en el almacenamiento',
      ),
    )
    reply.code(204)
  })
}
