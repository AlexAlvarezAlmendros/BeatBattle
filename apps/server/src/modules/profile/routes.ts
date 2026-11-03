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
import { qrPng } from '../../media/qrPng'
import type { SealedCover } from '../game/public'
import type { GameService } from '../game/service'
import type { ImageStorage } from '../storage/cloudinary'
import {
  changeUsername,
  findPublicProfile,
  findPublicUsername,
  getOwnProfile,
  type ProfileStore,
  removeAvatar,
  setAvatar,
  updateProfile,
} from './service'

/** Cambios de perfil: 30 por hora y cuenta (§4.13, `RNF-SEC-02`). */
export const PROFILE_CHANGES_PER_HOUR = 30
const HOUR_MS = 60 * 60 * 1000

/** Caché del QR del perfil: la dirección de un nombre no cambia (30 días, como el QR del recibo). */
export const PROFILE_QR_CACHE_SECONDS = 30 * 24 * 60 * 60

/** Lo que codifica el QR de la carta: la página pública del perfil (`/p/:username`). */
export const profilePageUrl = (publicUrl: string, username: string) =>
  `${publicUrl}/p/${encodeURIComponent(username)}`

export interface ProfileDeps {
  db: Db
  images: ImageStorage | null
  rateLimiter: RateLimiter
  /** La capa de juego (`profile_done`, tarea 7.9). */
  game: GameService
  /** La portada de una entrada sellada, para el historial del perfil público (tarea 7.13). */
  cover?: SealedCover
  /** Origen público de la web (`BB_PUBLIC_URL`): el QR del perfil lleva a `<origen>/p/:username`. */
  publicUrl: string
}

/** Perfil de productor (§2.3, §3.8.10, tarea 2.18). */
export function profileRoutes(app: FastifyInstance, deps: ProfileDeps): void {
  const store: ProfileStore = { db: deps.db, images: deps.images, game: deps.game, cover: deps.cover }
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

  // Público (§3.4.4, tarea 7.22): el QR del reverso de la carta, un PNG de la dirección pública del perfil y nada más.
  // La matriz, de `qrcode`, solo en el servidor (§4.1); el PNG, del codificador propio (el del QR del recibo, 4.13).
  app.get<{ Params: { username: string } }>('/api/profiles/:username/qr.png', async (req, reply) => {
    const found = await findPublicUsername(deps.db, req.params.username, req.now)
    if (!found) throw appError('NOT_FOUND', 'No hay ningún productor con ese nombre.')
    if ('redirectTo' in found)
      return reply.redirect(`/api/profiles/${encodeURIComponent(found.redirectTo)}/qr.png`, 301)
    reply.header('content-type', 'image/png')
    reply.header('cache-control', `public, max-age=${PROFILE_QR_CACHE_SECONDS}`)
    return reply.send(Buffer.from(qrPng(profilePageUrl(deps.publicUrl, found.username))))
  })

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
