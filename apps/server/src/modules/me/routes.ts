import type { DataEnvelope, Me } from '@beatbattle/shared'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { Db } from '../../db/client'
import { producerProfile } from '../../db/schema'
import type { ImageStorage } from '../storage/cloudinary'

/** El avatar del HUD: 64 px (§4.8.3), que con densidad 2× cubre los 46 px del marco. */
const HUD_AVATAR_SIZE = 64

/**
 * `GET /api/me` (tarea 2.15): la cuenta de la sesión, su número de carta y su XP. Sin sesión, `{ data: null }`
 * con 200: ser visitante no es un error (un 401 ensuciaba la consola de cada página).
 */
export function meRoutes(app: FastifyInstance, deps: { db: Db; images: ImageStorage | null }): void {
  app.get('/api/me', async (req): Promise<DataEnvelope<Me | null>> => {
    if (!req.user || (req.user as { banned?: boolean | null }).banned) return { data: null }
    const user = req.user as NonNullable<typeof req.user> & {
      username?: string | null
      displayUsername?: string | null
      role?: string | null
    }
    const [profile] = await deps.db
      .select({
        cardNumber: producerProfile.cardNumber,
        xp: producerProfile.xp,
        avatarPublicId: producerProfile.avatarPublicId,
      })
      .from(producerProfile)
      .where(eq(producerProfile.userId, user.id))
    return {
      data: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        username: user.username ?? '',
        displayUsername: user.displayUsername || user.username || user.name,
        role: user.role === 'admin' ? 'admin' : 'user',
        cardNumber: profile?.cardNumber ?? 0,
        xp: profile?.xp ?? 0,
        avatarUrl:
          profile?.avatarPublicId && deps.images
            ? deps.images.imageUrl(profile.avatarPublicId, { size: HUD_AVATAR_SIZE })
            : null,
      },
    }
  })
}
