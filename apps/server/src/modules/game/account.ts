import { eq } from 'drizzle-orm'
import { achievementUnlock, streakState, week, xpEvent } from '../../db/schema'
import type { AccountDataModule } from '../account/registry'

/**
 * La capa de juego en el registro de datos de la cuenta (guía §4.14, tarea 7.15; `RF-PRF-04`, `RF-PRF-05`,
 * `RNF-PRIV-01`): exporta el libro de XP, los logros y la racha en la sección `game` (junto a las entradas y los
 * votos) y los borra en el `batch` del borrado. Lo que otras cuentas ganaron votando sus entradas se queda: su
 * referencia es el id de la entrada, que ya no lleva a nadie, y el XP en vivo no se retira (§2.10).
 */
export const gameAccountData: AccountDataModule = {
  name: 'game',
  async exportData({ db, userId }) {
    const xpEvents = await db
      .select({
        kind: xpEvent.kind,
        ref: xpEvent.ref,
        week: week.slug,
        amount: xpEvent.amount,
        createdAt: xpEvent.createdAt,
      })
      .from(xpEvent)
      .leftJoin(week, eq(week.id, xpEvent.weekId))
      .where(eq(xpEvent.userId, userId))
      .orderBy(xpEvent.createdAt, xpEvent.kind, xpEvent.ref)
    const achievements = await db
      .select({
        id: achievementUnlock.achievementId,
        ref: achievementUnlock.ref,
        week: week.slug,
        unlockedAt: achievementUnlock.unlockedAt,
        seenAt: achievementUnlock.seenAt,
      })
      .from(achievementUnlock)
      .leftJoin(week, eq(week.id, achievementUnlock.weekId))
      .where(eq(achievementUnlock.userId, userId))
      .orderBy(achievementUnlock.unlockedAt, achievementUnlock.achievementId)
    const [streak] = await db
      .select({
        current: streakState.current,
        best: streakState.best,
        lastWeekNumber: streakState.lastWeekNumber,
        jokerSeason: streakState.jokerSeason,
      })
      .from(streakState)
      .where(eq(streakState.userId, userId))
    return { xpEvents, achievements, streak: streak ?? null }
  },
  async cleanup({ db, userId }) {
    return {
      statements: [
        db.delete(xpEvent).where(eq(xpEvent.userId, userId)),
        db.delete(achievementUnlock).where(eq(achievementUnlock.userId, userId)),
        db.delete(streakState).where(eq(streakState.userId, userId)),
      ],
    }
  },
}
