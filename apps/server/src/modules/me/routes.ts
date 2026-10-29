import { type DataEnvelope, type Me, SeenRequestSchema } from '@beatbattle/shared'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { requireSession } from '../../auth/guards'
import type { Db } from '../../db/client'
import { producerProfile } from '../../db/schema'
import { meGame } from '../game/public'
import { markGameSeen } from '../game/seen'
import type { ImageStorage } from '../storage/cloudinary'
import type { WeeksService } from '../weeks/service'

/** El avatar del HUD: 64 px (§4.8.3), que con densidad 2× cubre los 46 px del marco. */
const HUD_AVATAR_SIZE = 64

export interface MeDeps {
  db: Db
  images: ImageStorage | null
  /** Lo ya visto de las semanas (el drop y la ceremonia, 3.11 y 6.8). */
  weeks: Pick<WeeksService, 'markSeen'>
}

/**
 * `GET /api/me` (tarea 2.15): la cuenta de la sesión, su número de carta y su XP; desde la 7.13, con su capa de juego
 * en vivo (`game`). Sin sesión, `{ data: null }` con 200: ser visitante no es un error (un 401 ensuciaba la consola de
 * cada página). Y `POST /api/me/seen`, lo ya visto.
 */
export function meRoutes(app: FastifyInstance, deps: MeDeps): void {
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
        avatarPublicId: producerProfile.avatarPublicId,
      })
      .from(producerProfile)
      .where(eq(producerProfile.userId, user.id))
    const game = await meGame(deps.db, user.id, req.now)
    return {
      data: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        username: user.username ?? '',
        displayUsername: user.displayUsername || user.username || user.name,
        role: user.role === 'admin' ? 'admin' : 'user',
        cardNumber: profile?.cardNumber ?? 0,
        xp: game.xp,
        avatarUrl:
          profile?.avatarPublicId && deps.images
            ? deps.images.imageUrl(profile.avatarPublicId, { size: HUD_AVATAR_SIZE })
            : null,
        game,
      },
    }
  })

  // ── Lo ya visto (3.11; la capa de juego, 7.13) ─────────────────────────────────────────────────
  app.post('/api/me/seen', { preHandler: requireSession }, async (req, reply) => {
    const seen = SeenRequestSchema.parse(req.body)
    const userId = req.user?.id as string
    if (seen.kind === 'drop' || seen.kind === 'ceremony')
      await deps.weeks.markSeen(userId, seen.kind, seen.ref, req.now)
    else await markGameSeen(deps.db, userId, seen, req.now)
    reply.code(204)
  })
}
