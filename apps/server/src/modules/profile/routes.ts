import {
  AvatarConfirmSchema,
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
import type { ImageStorage } from '../storage/cloudinary'
import {
  changeUsername,
  findPublicProfile,
  getOwnProfile,
  type ProfileStore,
  removeAvatar,
  setAvatar,
  updateProfile,
} from './service'

/** Cambios de perfil: 30 por hora y cuenta (§4.13, `RNF-SEC-02`). */
export const PROFILE_CHANGES_PER_HOUR = 30
const HOUR_MS = 60 * 60 * 1000

export interface ProfileDeps {
  db: Db
  images: ImageStorage | null
  rateLimiter: RateLimiter
}

/** Perfil de productor (§2.3, §3.8.10, tarea 2.18). */
export function profileRoutes(app: FastifyInstance, deps: ProfileDeps): void {
  const store: ProfileStore = { db: deps.db, images: deps.images }
  const orphan = (req: FastifyRequest) => (publicId: string, error: unknown) =>
    req.log.warn({ publicId, err: error }, 'avatar anterior sin borrar en Cloudinary')
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
      const found = await findPublicProfile(store, req.params.username, req.now)
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
      return { data: await getOwnProfile(store, req.user?.id as string, req.now) }
    },
  )

  app.put(
    '/api/me/profile',
    { preHandler: requireSession },
    async (req): Promise<DataEnvelope<OwnProfile>> => {
      const patch = ProfileUpdateSchema.parse(req.body)
      await limit(req)
      return { data: await updateProfile(store, req.user?.id as string, patch, req.now) }
    },
  )

  app.put(
    '/api/me/username',
    { preHandler: requireSession },
    async (req): Promise<DataEnvelope<OwnProfile>> => {
      const { username } = UsernameChangeSchema.parse(req.body)
      await limit(req)
      return { data: await changeUsername(store, req.user?.id as string, username, req.now) }
    },
  )

  // El avatar (tarea 2.19, `RF-PRF-02`): se confirma después de subirlo con la firma de `/api/uploads/sign`.
  app.put(
    '/api/me/avatar',
    { preHandler: requireSession },
    async (req): Promise<DataEnvelope<OwnProfile>> => {
      const { publicId } = AvatarConfirmSchema.parse(req.body)
      await limit(req)
      return { data: await setAvatar(store, req.user?.id as string, publicId, req.now, orphan(req)) }
    },
  )

  app.delete(
    '/api/me/avatar',
    { preHandler: requireSession },
    async (req): Promise<DataEnvelope<OwnProfile>> => {
      await limit(req)
      return { data: await removeAvatar(store, req.user?.id as string, req.now, orphan(req)) }
    },
  )
}
