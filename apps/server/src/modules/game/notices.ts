import { jokerAvailable, type StreakState, streakBonusPercent, streakInPlay } from '@beatbattle/rules'
import { and, eq, inArray, sum } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { streakState, xpEvent } from '../../db/schema'

/**
 * La capa de juego en los avisos que ya salen (guía §2.12.7; tarea 7.31). Solo lo que da el sellado y la racha de las
 * semanas selladas: nada del XP en vivo de una semana en juego ni el total de la cuenta (`RF-NOTIF-13`).
 */

/** «Tu partida» del Lunes de batalla y de los resultados (el `game` de `ResultsBlock` en `@beatbattle/emails`). */
export interface WeekGame {
  xp: number
  goldenEarXp: number
  streak: number
  jokerSaved: boolean
  nextBonusPercent: number
}

/** Racha a partir de la que el recordatorio sale en su versión «racha en peligro» (§2.12). */
export const STREAK_REMINDER_MIN_WEEKS = 3

/**
 * Lo que el sellado de la semana `w` le ha dado a cada cuenta: el XP de resultado y de oído de oro del libro (con los
 * ajustes de los re-sellados, el de la revisión vigente) y la racha que dejó (`streak_state` con esa semana como
 * última aplicada). Devuelve una función por cuenta: `qualified` dice si su entrada de la semana clasificó (sin
 * clasificar y con racha, el comodín la salvó). `null` a quien no gana nada ni tiene racha.
 */
export async function sealedWeekGame(
  db: Db,
  w: { id: string; number: number },
): Promise<(userId: string, qualified: boolean) => WeekGame | null> {
  const xp = new Map<string, { result: number; goldenEar: number }>()
  for (const row of await db
    .select({ userId: xpEvent.userId, kind: xpEvent.kind, amount: sum(xpEvent.amount) })
    .from(xpEvent)
    .where(and(eq(xpEvent.weekId, w.id), inArray(xpEvent.kind, ['result', 'golden_ear'])))
    .groupBy(xpEvent.userId, xpEvent.kind)) {
    const mine = xp.get(row.userId) ?? { result: 0, goldenEar: 0 }
    if (row.kind === 'result') mine.result = Number(row.amount ?? 0)
    else mine.goldenEar = Number(row.amount ?? 0)
    xp.set(row.userId, mine)
  }
  const streaks = new Map(
    (
      await db
        .select({ userId: streakState.userId, current: streakState.current })
        .from(streakState)
        .where(eq(streakState.lastWeekNumber, w.number))
    ).map((row) => [row.userId, row.current]),
  )
  return (userId, qualified) => {
    const earned = xp.get(userId) ?? { result: 0, goldenEar: 0 }
    const total = Math.max(0, earned.result) + Math.max(0, earned.goldenEar)
    const streak = streaks.get(userId) ?? 0
    if (total === 0 && streak === 0) return null
    return {
      xp: total,
      goldenEarXp: Math.max(0, earned.goldenEar),
      streak,
      // Sin entrada clasificada, la racha solo sigue en pie si el comodín la salvó esta semana (§2.10).
      jokerSaved: streak > 0 && !qualified,
      nextBonusPercent: streakBonusPercent(streak + 1),
    }
  }
}

/** La racha en peligro de quien recibe el recordatorio (§2.12.7), o `null` para el de siempre. */
export interface StreakAtRisk {
  weeks: number
  jokerAvailable: boolean
  bonusPercent: number
}

/**
 * Las rachas de 3 semanas o más de `userIds` que están en juego en la semana `w`: la guardada tiene que llegar hasta
 * la semana anterior por número (`last_week_number = número − 1`); el comodín, el de la temporada de `w`.
 */
export async function streaksAtRisk(
  db: Db,
  userIds: readonly string[],
  w: { number: number; seasonId: string },
): Promise<Map<string, StreakAtRisk>> {
  const out = new Map<string, StreakAtRisk>()
  if (userIds.length === 0) return out
  const rows = await db
    .select()
    .from(streakState)
    .where(and(inArray(streakState.userId, [...userIds]), eq(streakState.lastWeekNumber, w.number - 1)))
  for (const row of rows) {
    if (row.current < STREAK_REMINDER_MIN_WEEKS) continue
    const state: StreakState = {
      current: row.current,
      best: row.best,
      lastWeekNumber: row.lastWeekNumber,
      jokerSeason: row.jokerSeason,
    }
    out.set(row.userId, {
      weeks: row.current,
      jokerAvailable: jokerAvailable(state, w.seasonId),
      bonusPercent: streakBonusPercent(streakInPlay(state)),
    })
  }
  return out
}
