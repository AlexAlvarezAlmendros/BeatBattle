import {
  type AchievementId,
  achievementById,
  LEVEL_MAX,
  STREAK_START,
  type StreakState,
  xpFor,
  xpForLevel,
} from '@beatbattle/rules'
import { and, count, eq, inArray, type SQL, sql } from 'drizzle-orm'
import type { BatchStatement } from '../../db/batch'
import type { Db } from '../../db/client'
import { achievementUnlock, producerProfile, streakState, type XpEventKind, xpEvent } from '../../db/schema'

/**
 * Acceso a las tablas de la capa de juego (guía §2.10, §4.11; tareas 7.8–7.10): las sentencias que escriben el libro
 * de XP, los logros, la racha y la caché de XP, siempre idempotentes y pensadas para el `batch` del hecho que las
 * provoca (como la cola de email), y las lecturas que necesitan quienes las preparan.
 *
 * **Condición del hecho** (`guard`): una expresión SQL booleana que cada sentencia repite en su `WHERE`, así que lo de
 * la capa de juego solo se escribe si el hecho ha ocurrido de verdad dentro del mismo `batch` (el voto guardado, la
 * entrada activa, la semana sellada con esa revisión), aunque el hecho sea un `INSERT … SELECT` condicionado que puede
 * no escribir nada.
 *
 * Lo ganado en vivo no se retira (§2.10). Solo el re-sellado corrige lo que da el sellado: ajustes del libro que pueden
 * restar y la retirada de un logro de resultado con su XP (§2.8, `withdrawStatements`). El borrado de la cuenta es del
 * registro de datos (`modules/account`).
 */

/** XP de un logro: el de su rareza, sin racha ni semana dorada (Anexo B). */
export const achievementXp = (id: AchievementId) =>
  xpFor({ kind: 'achievement', rarity: achievementById(id).rarity }, { goldenWeek: false, streakWeeks: 0 })

/** Condición del hecho (ver arriba), o ninguna. */
export type Guard = SQL | undefined

/** `WHERE 1 AND …`: el `WHERE` siempre presente evita además la ambigüedad de `INSERT … SELECT … ON CONFLICT`. */
function whereAll(conditions: readonly (SQL | undefined)[]): SQL {
  const present = conditions.filter((c): c is SQL => c !== undefined)
  return present.length === 0 ? sql`WHERE 1` : sql`WHERE ${sql.join(present, sql` AND `)}`
}

/** Un movimiento del libro de XP ya calculado (el importe lo da `xpFor` de `@beatbattle/rules`). */
export interface XpMovement {
  id: string
  userId: string
  kind: XpEventKind
  ref: string
  weekId: string | null
  /** Un entero; solo los ajustes del re-sellado pueden ser negativos (§2.8). */
  amount: number
  now: number
}

/**
 * `INSERT … ON CONFLICT DO NOTHING` de un movimiento (`RF-GAME-01`): repetirlo no suma, ni por la restricción de cuenta,
 * tipo y referencia ni por la de una sola primera entrada por semana. Con `weeklyCap`, solo entra si la cuenta tiene
 * menos movimientos de ese tipo en la semana, contados dentro de la propia sentencia (el tope de votos con XP,
 * `RF-GAME-03`): dos votos a la vez no lo pasan. Con `guard`, solo si el hecho ha ocurrido.
 */
export function xpMovementStatement(
  db: Db,
  m: XpMovement,
  weeklyCap?: number,
  guard?: Guard,
): BatchStatement {
  if (weeklyCap !== undefined && m.weekId === null)
    throw new RangeError('Un movimiento con tope semanal necesita su semana')
  const cap =
    weeklyCap === undefined
      ? undefined
      : sql`(
          SELECT count(*) FROM xp_event
          WHERE xp_event.user_id = ${m.userId} AND xp_event.kind = ${m.kind} AND xp_event.week_id = ${m.weekId}
        ) < ${weeklyCap}`
  return db.run(sql`
    INSERT INTO xp_event (id, user_id, kind, ref, week_id, amount, created_at)
    SELECT ${m.id}, ${m.userId}, ${m.kind}, ${m.ref}, ${m.weekId}, ${m.amount}, ${m.now}
    ${whereAll([cap, guard])}
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

/** ¿Tiene la cuenta el logro? (dentro del `batch`, con lo ya escrito en él). */
const hasUnlock = (userId: string, achievementId: string) => sql`EXISTS (
  SELECT 1 FROM achievement_unlock
  WHERE achievement_unlock.user_id = ${userId} AND achievement_unlock.achievement_id = ${achievementId}
)`

/**
 * El logro y su XP (§4.11): la fila de `achievement_unlock` y el movimiento `achievement` referido al logro, los dos
 * con `ON CONFLICT DO NOTHING`, así que un logro se gana (y se cobra) una sola vez. El XP solo entra si el logro está:
 * con `guard` (la condición del hecho, y la propia del logro si la tiene) nunca queda XP sin su logro.
 */
export function unlockStatements(
  db: Db,
  u: Unlock,
  xp: { id: string; amount: number },
  guard?: Guard,
): BatchStatement[] {
  return [
    db.run(sql`
      INSERT INTO achievement_unlock (user_id, achievement_id, ref, week_id, unlocked_at)
      SELECT ${u.userId}, ${u.achievementId}, ${u.ref}, ${u.weekId}, ${u.now}
      ${whereAll([guard])}
      ON CONFLICT DO NOTHING`),
    xpMovementStatement(
      db,
      {
        id: xp.id,
        userId: u.userId,
        kind: 'achievement',
        ref: u.achievementId,
        weekId: u.weekId,
        amount: xp.amount,
        now: u.now,
      },
      undefined,
      hasUnlock(u.userId, u.achievementId),
    ),
  ]
}

/**
 * Retira un logro con su XP (solo el re-sellado, a los logros de resultado cuya condición ya no se cumple; §2.8): borra
 * su movimiento y su fila, así que si se vuelve a ganar más adelante se cobra otra vez, una sola.
 */
export function withdrawStatements(
  db: Db,
  input: { userId: string; achievementId: string },
  guard?: Guard,
): BatchStatement[] {
  const { userId, achievementId } = input
  return [
    db.run(sql`
      DELETE FROM xp_event
      ${whereAll([
        sql`xp_event.user_id = ${userId}`,
        sql`xp_event.kind = 'achievement'`,
        sql`xp_event.ref = ${achievementId}`,
        guard,
      ])}`),
    db.run(sql`
      DELETE FROM achievement_unlock
      ${whereAll([
        sql`achievement_unlock.user_id = ${userId}`,
        sql`achievement_unlock.achievement_id = ${achievementId}`,
        guard,
      ])}`),
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
  guard?: Guard,
): BatchStatement[] {
  const { userId, weekId, now } = input
  return [
    db.run(sql`
      INSERT INTO achievement_unlock (user_id, achievement_id, ref, week_id, unlocked_at)
      SELECT ${userId}, 'level_20', NULL, ${weekId}, ${now}
      ${whereAll([
        sql`(SELECT coalesce(sum(xp_event.amount), 0) FROM xp_event WHERE xp_event.user_id = ${userId}) >= ${LEVEL_20_XP}`,
        guard,
      ])}
      ON CONFLICT DO NOTHING`),
    xpMovementStatement(
      db,
      { id: input.xpId, userId, kind: 'achievement', ref: 'level_20', weekId, amount: input.amount, now },
      undefined,
      hasUnlock(userId, 'level_20'),
    ),
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

/** Guarda la racha tras aplicar las semanas selladas (`advanceStreak`); re-aplicarla deja lo mismo. */
export function streakStatement(db: Db, userId: string, state: StreakState, guard?: Guard): BatchStatement {
  return db.run(sql`
    INSERT INTO streak_state (user_id, current, best, last_week_number, joker_season)
    SELECT ${userId}, ${state.current}, ${state.best}, ${state.lastWeekNumber}, ${state.jokerSeason}
    ${whereAll([guard])}
    ON CONFLICT (user_id) DO UPDATE SET
      current = excluded.current,
      best = excluded.best,
      last_week_number = excluded.last_week_number,
      joker_season = excluded.joker_season`)
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

/** Movimientos de un tipo que tiene una cuenta en total (las semanas con entrada que llegó a `active`, Anexo C). */
export async function kindCount(db: Db, userId: string, kind: XpEventKind): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(xpEvent)
    .where(and(eq(xpEvent.userId, userId), eq(xpEvent.kind, kind)))
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
