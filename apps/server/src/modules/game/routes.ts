import { type DataEnvelope, DeclaredAchievementSchema, type GameDelta } from '@beatbattle/shared'
import type { FastifyInstance } from 'fastify'
import { requireSession } from '../../auth/guards'
import { runBatch } from '../../db/batch'
import type { Db } from '../../db/client'
import type { RateLimiter } from '../../lib/rateLimit'
import type { GameService } from './service'

/** Logros declarados por el navegador: 10 por hora y cuenta (§4.10, §4.13). */
export const DECLARED_ACHIEVEMENTS_PER_HOUR = 10
const HOUR_MS = 60 * 60 * 1000

export interface GameRoutesDeps {
  db: Db
  game: GameService
  rateLimiter: RateLimiter
}

/**
 * Los logros que ocurren en el navegador (guía §4.10, Anexo C; tarea 7.14, hueco G5): `POST /api/me/achievements`
 * con un logro de la lista blanca (`BROWSER_ACHIEVEMENTS`: en la Fase 7, `share_card`), con sesión y como mucho 10
 * por hora. Da el logro y su XP, nada más (y `level_20` si ese XP cruza el nivel, como cualquier hecho); repetirlo no
 * suma. Un logro fuera de la lista → 422 (`VALIDATION_FAILED`).
 */
export function gameRoutes(app: FastifyInstance, deps: GameRoutesDeps): void {
  app.post(
    '/api/me/achievements',
    { preHandler: requireSession },
    async (req): Promise<DataEnvelope<GameDelta>> => {
      const { achievement } = DeclaredAchievementSchema.parse(req.body)
      const userId = req.user?.id as string
      await deps.rateLimiter.enforce({
        key: `achievement:user:${userId}`,
        limit: DECLARED_ACHIEVEMENTS_PER_HOUR,
        windowMs: HOUR_MS,
        now: req.now,
      })
      const plan = await deps.game.declared(userId, { achievement, now: req.now })
      await runBatch(deps.db, plan.statements)
      return { data: plan.delta }
    },
  )
}
