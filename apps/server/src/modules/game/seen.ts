import { levelOf } from '@beatbattle/rules'
import type { SeenRequest } from '@beatbattle/shared'
import { and, eq, isNull, sql } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { achievementUnlock, producerProfile, seenFlag } from '../../db/schema'
import { appError } from '../../lib/errors'
import { closedAt, weeksOfSeason } from '../seasons/repo'

type GameSeen = Extract<SeenRequest, { kind: 'level' | 'achievement' | 'season_champion' }>

/**
 * Lo ya visto de la capa de juego (`POST /api/me/seen`, tarea 7.13), para que cada animación salga una sola vez:
 *
 * - `level` (`RF-GAME-09`): `producer_profile.level_seen` sube hasta ese nivel, nunca por encima del que tiene la
 *   cuenta y nunca hacia abajo (si un re-sellado le baja el nivel, volver a subir a uno ya celebrado no lo repite);
 * - `achievement` (§3.8.8): el aviso de ese logro (`achievement_unlock.seen_at`); 404 si no lo tiene;
 * - `season_champion` (`RF-ARC-05`): la ceremonia del campeón de esa temporada (`seen_flag`); 404 si aún no está cerrada.
 *
 * Repetirlo no cambia nada.
 */
export async function markGameSeen(db: Db, userId: string, seen: GameSeen, now: number): Promise<void> {
  if (seen.kind === 'level') {
    const [profile] = await db
      .select({ xp: producerProfile.xp })
      .from(producerProfile)
      .where(eq(producerProfile.userId, userId))
    const level = Math.min(seen.ref, levelOf(Math.max(0, profile?.xp ?? 0)))
    await db
      .update(producerProfile)
      .set({ levelSeen: sql`max(${producerProfile.levelSeen}, ${level})` })
      .where(eq(producerProfile.userId, userId))
    return
  }
  if (seen.kind === 'achievement') {
    const [owned] = await db
      .select({ seenAt: achievementUnlock.seenAt })
      .from(achievementUnlock)
      .where(and(eq(achievementUnlock.userId, userId), eq(achievementUnlock.achievementId, seen.ref)))
    if (!owned) throw appError('NOT_FOUND', 'Ese logro aún no es tuyo.')
    await db
      .update(achievementUnlock)
      .set({ seenAt: now })
      .where(
        and(
          eq(achievementUnlock.userId, userId),
          eq(achievementUnlock.achievementId, seen.ref),
          isNull(achievementUnlock.seenAt),
        ),
      )
    return
  }
  if (!closedAt(seen.ref, await weeksOfSeason(db, seen.ref), now))
    throw appError('NOT_FOUND', 'Esa temporada aún no está cerrada.')
  await db
    .insert(seenFlag)
    .values({ userId, kind: 'season_champion', ref: seen.ref, seenAt: now })
    .onConflictDoNothing()
}
