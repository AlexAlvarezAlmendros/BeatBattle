import {
  type DataEnvelope,
  type OwnProfile,
  ProfileUpdateSchema,
  type PublicProfile,
  UsernameChangeSchema,
} from '@beatbattle/shared'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { requireSession } from '../../auth/guards'
import type { Db } from '../../db/client'
import { appError } from '../../lib/errors'
import type { RateLimiter } from '../../lib/rateLimit'
import { changeUsername, findPublicProfile, getOwnProfile, updateProfile } from './service'

/** Cambios de perfil: 30 por hora y cuenta (§4.13, `RNF-SEC-02`). */
export const PROFILE_CHANGES_PER_HOUR = 30
const HOUR_MS = 60 * 60 * 1000

export interface ProfileDeps {
  db: Db
  rateLimiter: RateLimiter
}

/** Perfil de productor (§2.3, §3.8.10, tarea 2.18). */
export function profileRoutes(app: FastifyInstance, deps: ProfileDeps): void {
  const { db } = deps
  const limit = (req: FastifyRequest) =>
    deps.rateLimiter.enforce({
      key: `profile:user:${req.user?.id}`,
      limit: PROFILE_CHANGES_PER_HOUR,
      windowMs: HOUR_MS,
      now: req.now,
    })

  // Público. Un nombre anterior responde 301 al nuevo (`RF-PRF-03`); la web lo sigue y cambia la URL.
  app.get<{ Params: { username: string } }>(
    '/api/profiles/:username',
    async (req, reply): Promise<DataEnvelope<PublicProfile> | undefined> => {
      const found = await findPublicProfile(db, req.params.username, req.now)
      if (!found) throw appError('NOT_FOUND', 'No hay ningún productor con ese nombre.')
      if ('redirectTo' in found) {
        reply.redirect(`/api/profiles/${encodeURIComponent(found.redirectTo)}`, 301)
        return undefined
      }
      return { data: found.profile }
    },
  )

  app.get(
    '/api/me/profile',
    { preHandler: requireSession },
    async (req): Promise<DataEnvelope<OwnProfile>> => {
      return { data: await getOwnProfile(db, req.user?.id as string, req.now) }
    },
  )

  app.put(
    '/api/me/profile',
    { preHandler: requireSession },
    async (req): Promise<DataEnvelope<OwnProfile>> => {
      const patch = ProfileUpdateSchema.parse(req.body)
      await limit(req)
      return { data: await updateProfile(db, req.user?.id as string, patch, req.now) }
    },
  )

  app.put(
    '/api/me/username',
    { preHandler: requireSession },
    async (req): Promise<DataEnvelope<OwnProfile>> => {
      const { username } = UsernameChangeSchema.parse(req.body)
      await limit(req)
      return { data: await changeUsername(db, req.user?.id as string, username, req.now) }
    },
  )
}
