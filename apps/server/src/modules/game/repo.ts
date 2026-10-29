import { LEVEL_MAX, STREAK_START, type StreakState, xpForLevel } from '@beatbattle/rules'
import { and, count, eq, inArray, sql } from 'drizzle-orm'
import type { BatchStatement } from '../../db/batch'
import type { Db } from '../../db/client'
import { achievementUnlock, producerProfile, streakState, type XpEventKind, xpEvent } from '../../db/schema'

/**
 * Acceso a las tablas de la capa de juego (guía §2.10, §4.11; tarea 7.8): las sentencias que escriben el libro de XP,
 * los logros, la racha y la caché de XP, siempre idempotentes y pensadas para el `batch` del hecho que las provoca
 * (como la cola de email), y las lecturas que necesitan quienes las preparan. Ninguna sentencia borra: lo ganado no
 * se retira (§2.10); el borrado de la cuenta es del registro de datos (`modules/account`).
 */

/** Un movimiento del libro de XP ya calculado (el importe lo da `xpFor` de `@beatbattle/rules`). */
export interface XpMovement {
  id: string
  userId: string
  kind: XpEventKind
  ref: string
  weekId: string | null
  amount: number
  now: number
}

/**
 * `INSERT … ON CONFLICT DO NOTHING` de un movimiento (`RF-GAME-01`): repetirlo no suma, ni por la restricción de cuenta,
 * tipo y referencia ni por la de una sola primera entrada por semana. Con `weeklyCap`, solo entra si la cuenta tiene
 * menos movimientos de ese tipo en la semana, contados dentro de la propia sentencia (el tope de votos con XP,
 * `RF-GAME-03`): dos votos a la vez no lo pasan.
 */
export function xpMovementStatement(db: Db, m: XpMovement, weeklyCap?: number): BatchStatement {
  if (weeklyCap === undefined)
    return db
      .insert(xpEvent)
      .values({
        id: m.id,
        userId: m.userId,
        kind: m.kind,
        ref: m.ref,
        weekId: m.weekId,
        amount: m.amount,
        createdAt: m.now,
      })
      .onConflictDoNothing()
  if (m.weekId === null) throw new RangeError('Un movimiento con tope semanal necesita su semana')
  // `INSERT … SELECT … WHERE` con `ON CONFLICT`: el `WHERE` evita la ambigüedad del analizador de SQLite.
  return db.run(sql`
    INSERT INTO xp_event (id, user_id, kind, ref, week_id, amount, created_at)
    SELECT ${m.id}, ${m.userId}, ${m.kind}, ${m.ref}, ${m.weekId}, ${m.amount}, ${m.now}
    WHERE (
      SELECT count(*) FROM xp_event
      WHERE xp_event.user_id = ${m.userId} AND xp_event.kind = ${m.kind} AND xp_event.week_id = ${m.weekId}
    ) < ${weeklyCap}
    ON CONFLICT DO NOTHING`)
}

/** Un logro desbloqueado: lo que lo desbloqueó (`ref`) y su semana, si la tiene. */
export interface Unlock {
  userId: string
  achievementId: string
  ref: string | null
  weekId: string | null
  now: number
}

/**
 * El logro y su XP (§4.11): la fila de `achievement_unlock` y el movimiento `achievement` referido al logro, los dos
 * con `ON CONFLICT DO NOTHING`, así que un logro se gana (y se cobra) una sola vez.
 */
export function unlockStatements(db: Db, u: Unlock, xp: { id: string; amount: number }): BatchStatement[] {
  return [
    db
      .insert(achievementUnlock)
      .values({
        userId: u.userId,
        achievementId: u.achievementId,
        ref: u.ref,
        weekId: u.weekId,
        unlockedAt: u.now,
      })
      .onConflictDoNothing(),
    xpMovementStatement(db, {
      id: xp.id,
      userId: u.userId,
      kind: 'achievement',
      ref: u.achievementId,
      weekId: u.weekId,
      amount: xp.amount,
      now: u.now,
    }),
  ]
}

/** XP con el que se llega al nivel 20 (`level_20`, Anexo C). */
export const LEVEL_20_XP = xpForLevel(LEVEL_MAX)

/**
 * `level_20` en el propio `batch` (Anexo C: «también si lo empuja el XP de otro logro»): se desbloquea si la suma del
 * libro, con lo que el `batch` ya ha escrito antes, llega al nivel 20, y su XP solo entra si el logro está. Van
 * después de los movimientos del hecho y antes de recalcular la caché.
 */
export function level20Statements(
  db: Db,
  input: { userId: string; weekId: string | null; now: number; xpId: string; amount: number },
): BatchStatement[] {
  const { userId, weekId, now } = input
  return [
    db.run(sql`
      INSERT INTO achievement_unlock (user_id, achievement_id, ref, week_id, unlocked_at)
      SELECT ${userId}, 'level_20', NULL, ${weekId}, ${now}
      WHERE (SELECT coalesce(sum(xp_event.amount), 0) FROM xp_event WHERE xp_event.user_id = ${userId}) >= ${LEVEL_20_XP}
      ON CONFLICT DO NOTHING`),
    db.run(sql`
      INSERT INTO xp_event (id, user_id, kind, ref, week_id, amount, created_at)
      SELECT ${input.xpId}, ${userId}, 'achievement', 'level_20', ${weekId}, ${input.amount}, ${now}
      WHERE EXISTS (
        SELECT 1 FROM achievement_unlock
        WHERE achievement_unlock.user_id = ${userId} AND achievement_unlock.achievement_id = 'level_20'
      )
      ON CONFLICT DO NOTHING`),
  ]
}

/**
 * La caché `producer_profile.xp` recalculada como la suma del libro de la cuenta (§4.11), al final del `batch`: nunca se
 * desvía, aunque algún movimiento ya existiera o el tope lo dejara fuera.
 */
export function refreshXpStatement(db: Db, userId: string): BatchStatement {
  return db
    .update(producerProfile)
    .set({
      xp: sql`(SELECT coalesce(sum(xp_event.amount), 0) FROM xp_event WHERE xp_event.user_id = ${userId})`,
    })
    .where(eq(producerProfile.userId, userId))
}

/** Guarda la racha tras aplicar una semana sellada (`advanceStreak`); re-aplicarla deja lo mismo. */
export function streakStatement(db: Db, userId: string, state: StreakState): BatchStatement {
  const values = {
    current: state.current,
    best: state.best,
    lastWeekNumber: state.lastWeekNumber,
    jokerSeason: state.jokerSeason,
  }
  return db
    .insert(streakState)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: streakState.userId, set: values })
}

// ─── Lecturas ────────────────────────────────────────────────────────────────────────────────────────────────────

/** XP del libro de una cuenta (la verdad de la que `producer_profile.xp` es caché). */
export async function ledgerXp(db: Db, userId: string): Promise<number> {
  const [row] = await db
    .select({ xp: sql<number>`coalesce(sum(${xpEvent.amount}), 0)` })
    .from(xpEvent)
    .where(eq(xpEvent.userId, userId))
  return Number(row?.xp ?? 0)
}

/**
 * Las referencias que ya están en el libro, de un tipo y entre unas dadas: de una cuenta o, con `userId = null`, de
 * cualquiera (la primera entrada de la semana es una para toda la batalla).
 */
export async function existingRefs(
  db: Db,
  userId: string | null,
  kind: XpEventKind,
  refs: readonly string[],
): Promise<Set<string>> {
  if (refs.length === 0) return new Set<string>()
  const rows = await db
    .select({ ref: xpEvent.ref })
    .from(xpEvent)
    .where(
      and(
        userId === null ? undefined : eq(xpEvent.userId, userId),
        eq(xpEvent.kind, kind),
        inArray(xpEvent.ref, [...refs]),
      ),
    )
  return new Set(rows.map((row) => row.ref))
}

/** Movimientos de un tipo que tiene una cuenta en una semana (el tope de votos con XP se cuenta aquí). */
export async function weeklyCount(
  db: Db,
  userId: string,
  kind: XpEventKind,
  weekId: string,
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(xpEvent)
    .where(and(eq(xpEvent.userId, userId), eq(xpEvent.kind, kind), eq(xpEvent.weekId, weekId)))
  return row?.n ?? 0
}

/** Los logros que ya tiene una cuenta. */
export async function unlockedIds(db: Db, userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ id: achievementUnlock.achievementId })
    .from(achievementUnlock)
    .where(eq(achievementUnlock.userId, userId))
  return new Set(rows.map((row) => row.id))
}

/** La racha guardada de una cuenta, o la de partida. */
export async function streakOfAccount(db: Db, userId: string): Promise<StreakState> {
  const [row] = await db.select().from(streakState).where(eq(streakState.userId, userId))
  if (!row) return STREAK_START
  return {
    current: row.current,
    best: row.best,
    lastWeekNumber: row.lastWeekNumber,
    jokerSeason: row.jokerSeason,
  }
}
