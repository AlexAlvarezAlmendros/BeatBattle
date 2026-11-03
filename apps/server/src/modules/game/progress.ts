import {
  ACHIEVEMENT_IDS,
  ACHIEVEMENTS,
  type AchievementId,
  achievementById,
  addDays,
  isAchievementId,
  type LocalDate,
  levelOf,
  localDateOf,
  RANK_LADDER,
  rankTitle,
  zonedInstant,
} from '@beatbattle/rules'
import { and, eq, inArray, type SQL, type SQLWrapper, sql } from 'drizzle-orm'
import { type BatchStatement, runBatch } from '../../db/batch'
import type { Db } from '../../db/client'
import { achievementUnlock, user, week, xpEvent } from '../../db/schema'
import { enqueueEmail } from '../../email/outbox'
import { madridLongDate } from '../weeks/schedule'
import { achievementXp } from './repo'

/**
 * `game.progress`, el progreso del día (guía §2.12.7; tarea 7.29). Desde las 19:00 (Madrid), el `tick` mira el tramo que
 * acaba a esa hora —de las 19:00 del día anterior (exclusivo) a las 19:00 (incluido)— y encola un solo email a cada
 * cuenta verificada que en él sube de rango o desbloquea un logro épico o legendario. La clave es por cuenta y día
 * (`game.progress:<cuenta>:<AAAA-MM-DD>`), así que el `tick` lo puede intentar cada 15 minutos sin duplicar
 * (`RF-NOTIF-02`); preferencia (`progress_on`), horas de silencio y tope semanal, al enviar (`RF-NOTIF-08`).
 *
 * **Juego limpio** (`RF-NOTIF-13`): solo cuenta lo que no tiene semana y lo de las semanas selladas. Un movimiento del
 * libro o un logro cuentan en su instante si no tienen semana y, si la tienen, en el del sellado de su semana o en el
 * suyo si es posterior (un ajuste del re-sellado); lo de una semana sin sellar todavía no cuenta. Lo que se gana durante
 * una semana ciega llega junto el día que se sella, y ningún email dice antes quién ha subido.
 *
 * Re-mira el tramo entero en cada `tick` hasta el siguiente (una suma por cuenta sobre el libro): con el tamaño de la
 * batalla es poco, y así lo que se confirma tarde dentro del tramo no se pierde.
 */

/** A qué hora sale el progreso del día (Madrid). */
export const PROGRESS_AT = { hour: 19, minute: 0, second: 0 } as const

/** Las rarezas que lo disparan y van en él (§2.12.7). */
const BIG_RARITIES = new Set(['epic', 'legendary'])
const BIG_ACHIEVEMENTS: readonly AchievementId[] = ACHIEVEMENTS.filter((a) => BIG_RARITIES.has(a.rarity)).map(
  (a) => a.id,
)
const ENQUEUE_CHUNK = 200

export interface ProgressWindow {
  /** El día de las 19:00 que cierra el tramo. */
  day: LocalDate
  /** `AAAA-MM-DD`, para la clave de idempotencia. */
  key: string
  /** Las 19:00 del día anterior (exclusivo). */
  start: number
  /** Las 19:00 del día (incluido). */
  end: number
}

const pad = (n: number) => String(n).padStart(2, '0')

/** El último tramo cerrado en `now` (también los días de cambio de hora, que tienen 23 o 25 h). */
export function progressWindow(now: number): ProgressWindow {
  const today = localDateOf(now)
  const day = now >= zonedInstant(today, PROGRESS_AT) ? today : addDays(today, -1)
  return {
    day,
    key: `${day.year}-${pad(day.month)}-${pad(day.day)}`,
    start: zonedInstant(addDays(day, -1), PROGRESS_AT),
    end: zonedInstant(day, PROGRESS_AT),
  }
}

/**
 * El instante en que cuenta una fila con semana (`week` unida por la izquierda): el suyo si no tiene semana; si la
 * tiene, el del sellado o el suyo si es posterior; `NULL` (nunca) con la semana sin sellar.
 */
function countedAt(instant: SQLWrapper, weekId: SQLWrapper): SQL {
  // `max(a, b)` de SQLite con dos argumentos: `NULL` si alguno lo es.
  return sql`(CASE WHEN ${weekId} IS NULL THEN ${instant} ELSE max(${instant}, ${week.sealedAt}) END)`
}

const rankIndex = (xp: number) => {
  const id = rankTitle(levelOf(Math.max(0, xp)))
  return RANK_LADDER.findIndex((step) => step.id === id)
}

export interface ProgressDeps {
  db: Db
  newId: () => string
}

export interface ProgressPayload {
  dayText: string
  username: string | null
  rank: { from: string; to: string; level: number; next: { to: string; level: number } | null } | null
  achievements: { id: AchievementId; rarity: 'epic' | 'legendary'; xp: number }[]
}

/** Lo que encola el tick para el tramo de `now`: el número de cuentas con progreso (las ya encoladas, también). */
export async function scheduleProgressEmails(deps: ProgressDeps, now: number): Promise<number> {
  const { db } = deps
  const { key, start, end } = progressWindow(now)

  // El XP que cuenta al empezar y al acabar el tramo, de las cuentas con algo que cuenta dentro de él.
  const xpAt = countedAt(xpEvent.createdAt, xpEvent.weekId)
  const sums = await db
    .select({
      userId: xpEvent.userId,
      before: sql<number>`coalesce(sum(CASE WHEN ${xpAt} <= ${start} THEN ${xpEvent.amount} ELSE 0 END), 0)`,
      after: sql<number>`coalesce(sum(CASE WHEN ${xpAt} <= ${end} THEN ${xpEvent.amount} ELSE 0 END), 0)`,
    })
    .from(xpEvent)
    .leftJoin(week, eq(week.id, xpEvent.weekId))
    .groupBy(xpEvent.userId)
    .having(sql`max(CASE WHEN ${xpAt} > ${start} AND ${xpAt} <= ${end} THEN 1 ELSE 0 END) = 1`)
  const promotions = new Map<string, ProgressPayload['rank']>()
  for (const row of sums) {
    const from = rankIndex(Number(row.before))
    const to = rankIndex(Number(row.after))
    if (to <= from) continue
    const next = RANK_LADDER[to + 1]
    promotions.set(row.userId, {
      from: (RANK_LADDER[from] as (typeof RANK_LADDER)[number]).id,
      to: (RANK_LADDER[to] as (typeof RANK_LADDER)[number]).id,
      level: levelOf(Number(row.after)),
      next: next ? { to: next.id, level: next.fromLevel } : null,
    })
  }

  // Los logros épicos y legendarios que cuentan dentro del tramo.
  const unlockAt = countedAt(achievementUnlock.unlockedAt, achievementUnlock.weekId)
  const unlocks = await db
    .select({ userId: achievementUnlock.userId, id: achievementUnlock.achievementId })
    .from(achievementUnlock)
    .leftJoin(week, eq(week.id, achievementUnlock.weekId))
    .where(
      and(
        inArray(achievementUnlock.achievementId, [...BIG_ACHIEVEMENTS]),
        sql`${unlockAt} > ${start} AND ${unlockAt} <= ${end}`,
      ),
    )
  const big = new Map<string, AchievementId[]>()
  for (const row of unlocks) {
    if (!isAchievementId(row.id)) continue
    big.set(row.userId, [...(big.get(row.userId) ?? []), row.id])
  }

  const candidates = [...new Set([...promotions.keys(), ...big.keys()])]
  if (candidates.length === 0) return 0
  const accounts = await db
    .select({ id: user.id, username: user.username, displayUsername: user.displayUsername })
    .from(user)
    .where(and(inArray(user.id, candidates), eq(user.emailVerified, true)))

  const dayText = madridLongDate(end)
  const order = (a: AchievementId, b: AchievementId) =>
    Number(achievementById(b).rarity === 'legendary') - Number(achievementById(a).rarity === 'legendary') ||
    ACHIEVEMENT_IDS.indexOf(a) - ACHIEVEMENT_IDS.indexOf(b)
  const statements: BatchStatement[] = []
  for (const account of accounts.sort((a, b) => a.id.localeCompare(b.id))) {
    const payload: ProgressPayload = {
      dayText,
      username: account.displayUsername || account.username || null,
      rank: promotions.get(account.id) ?? null,
      achievements: (big.get(account.id) ?? []).sort(order).map((id) => ({
        id,
        rarity: achievementById(id).rarity as 'epic' | 'legendary',
        xp: achievementXp(id),
      })),
    }
    statements.push(
      enqueueEmail(db, {
        id: deps.newId(),
        kind: 'game.progress',
        target: { userId: account.id },
        idempotencyKey: `game.progress:${account.id}:${key}`,
        payload: payload as unknown as Record<string, unknown>,
        now,
      }),
    )
  }
  for (let i = 0; i < statements.length; i += ENQUEUE_CHUNK)
    await runBatch(db, statements.slice(i, i + ENQUEUE_CHUNK))
  return statements.length
}
