import {
  ACHIEVEMENTS,
  type AchievementId,
  GOLDEN_EAR_MIN_VOTES,
  goldenEar,
  replaySealedWeeks,
  type SealedEntry,
  type SealedWeekFacts,
  STREAK_START,
  type StreakState,
} from '@beatbattle/rules'
import { and, count, eq, inArray, isNotNull, ne, or, sql, sum } from 'drizzle-orm'
import type { BatchStatement } from '../../db/batch'
import type { Db } from '../../db/client'
import { achievementUnlock, entry, result, streakState, user, week, xpEvent } from '../../db/schema'
import type { WeekSnapshot } from '../results/snapshot'
import { championUnlock, seasonChampionChange } from '../seasons/closing'
import {
  achievementXp,
  type Guard,
  level20Statements,
  refreshXpStatement,
  streakStatement,
  unlockStatements,
  withdrawStatements,
  xpMovementStatement,
} from './repo'

/**
 * La capa de juego del sellado y del re-sellado (guía §2.8, §2.10, §4.11; tarea 7.10). Lo que da el sellado —el XP de
 * resultado, el oído de oro, la racha y los logros de resultado— es una función de las semanas selladas en su revisión
 * vigente (`replaySealedWeeks`), y el libro la sigue (hueco G2):
 *
 * - se re-juega desde la semana que se sella (o se corrige) hasta la última sellada, porque las posteriores dependen de
 *   ella (la racha, `double`, `comeback`, `oracle`, `win_3`);
 * - el XP de resultado y el de oído de oro de cada una de esas semanas queda igual a lo que da la revisión vigente: la
 *   primera vez, con su fila (`ref` = la semana); después, con un **ajuste** referido a la revisión que lo provoca
 *   (`<semana>#<semana corregida>:<revisión>`), que puede restar;
 * - un logro de resultado que se cumple en alguna de esas semanas y la cuenta no tiene, se gana en la primera; uno que
 *   se ganó en una de ellas y ya no se cumple en ninguna semana sellada, se retira con su XP;
 * - la racha guardada (`streak_state`) queda la que dan las semanas selladas;
 * - si con esta semana su temporada queda cerrada (o ya lo estaba y se re-sella), sus campeones ganan `season_champ`
 *   y quien deja de serlo de toda temporada cerrada lo pierde con su XP (tarea 7.11, `seasonChampionChange`).
 *
 * Todo condicionado a que la semana quede sellada con esa revisión en el mismo `batch`. Re-ejecutarlo no cambia nada
 * (`RF-GAME-01`): lo escrito ya es lo que da la revisión vigente. La clasificación llega calculada (`WeekSnapshot`, sin
 * nada de la capa de juego, `RF-GAME-10`) y aquí solo se lee.
 */

/** Los logros que mira el sellado (`weekSealed`, Anexo C): los únicos que el re-sellado puede retirar. */
export const SEALING_ACHIEVEMENTS: readonly AchievementId[] = ACHIEVEMENTS.filter((a) =>
  a.events.includes('weekSealed'),
).map((a) => a.id)

export interface SealingInput {
  /** La semana que se sella o se re-sella. */
  weekId: string
  /** La revisión que se escribe (1 al sellar). */
  revision: number
  /** Su clasificación recién calculada (la que se guarda en el mismo `batch`). */
  snapshot: WeekSnapshot
  now: number
  newId: () => string
}

type SealedKind = 'result' | 'golden_ear'

/** Suma de las estrellas a partir del histograma `[n1..n5]`. */
function starsOf(histogram: readonly number[]): number {
  return histogram.reduce((total, n, i) => total + n * (i + 1), 0)
}

const sameStreak = (a: StreakState, b: StreakState) =>
  a.current === b.current &&
  a.best === b.best &&
  a.lastWeekNumber === b.lastWeekNumber &&
  a.jokerSeason === b.jokerSeason

/** Las sentencias de la capa de juego de un sellado o re-sellado, para su `batch`. */
export async function sealingStatements(db: Db, input: SealingInput): Promise<BatchStatement[]> {
  const { weekId, revision, snapshot, now, newId } = input

  // Las semanas selladas (y la que se sella ahora), en orden de número.
  const weeks = (
    await db
      .select({
        id: week.id,
        number: week.number,
        seasonId: week.seasonId,
        golden: week.golden,
        challenge: week.challenge,
      })
      .from(week)
      .where(or(isNotNull(week.sealedAt), eq(week.id, weekId)))
      .orderBy(week.number)
  ).map((w) => ({ ...w, hasChallenge: w.challenge !== null }))
  const target = weeks.find((w) => w.id === weekId)
  if (!target) return []
  const touched = new Set(weeks.filter((w) => w.number >= target.number).map((w) => w.id))

  // Las entradas de cada semana en su revisión vigente; la que se sella, con su clasificación nueva.
  const entries = new Map<string, Map<string, SealedEntry>>()
  const qualified = new Map<string, number>()
  const put = (wId: string, userId: string, item: SealedEntry) => {
    const byUser = entries.get(wId) ?? new Map<string, SealedEntry>()
    byUser.set(userId, item)
    entries.set(wId, byUser)
    if (item.position !== null) qualified.set(wId, (qualified.get(wId) ?? 0) + 1)
  }
  const hasChallenge = new Map(weeks.map((w) => [w.id, w.hasChallenge]))
  const others = await db
    .select({
      weekId: result.weekId,
      position: result.position,
      votes: result.votes,
      histogram: result.histogram,
      userId: entry.userId,
      challengeClaimed: entry.challengeClaimed,
    })
    .from(result)
    .innerJoin(week, and(eq(week.id, result.weekId), eq(week.resultRevision, result.revision)))
    .innerJoin(entry, eq(entry.id, result.entryId))
    .where(and(isNotNull(week.sealedAt), ne(week.id, weekId)))
  for (const row of others)
    put(row.weekId, row.userId, {
      position: row.position,
      votes: row.votes,
      starsSum: starsOf(JSON.parse(row.histogram) as number[]),
      challengeClaimed: row.challengeClaimed && hasChallenge.get(row.weekId) === true,
    })
  const owners = new Map(snapshot.entries.map((e) => [e.id, e]))
  for (const row of snapshot.rows) {
    const owner = owners.get(row.entryId)
    if (!owner) continue
    put(weekId, owner.userId, {
      position: row.position,
      votes: row.votes,
      starsSum: starsOf(row.histogram),
      challengeClaimed: owner.challengeClaimed && target.hasChallenge,
    })
  }

  // El oído de oro de la semana que se sella, a los jurados con cuenta y 8 votos válidos o más.
  const perVoter = new Map<string, number>()
  for (const v of snapshot.votes) perVoter.set(v.voterId, (perVoter.get(v.voterId) ?? 0) + 1)
  const candidates = [...perVoter].filter(([, n]) => n >= GOLDEN_EAR_MIN_VOTES).map(([id]) => id)
  const withAccount = candidates.length
    ? new Set(
        (await db.select({ id: user.id }).from(user).where(inArray(user.id, candidates))).map((u) => u.id),
      )
    : new Set<string>()
  const earWinners = new Set([...withAccount].filter((voterId) => goldenEar(voterId, snapshot.votes).won))

  // Lo que ya dice el libro del sellado (resultado y oído de oro por cuenta y semana), los logros de resultado y las
  // rachas guardadas.
  const ledger = new Map<string, { amount: number; rows: number }>()
  const key = (userId: string, kind: SealedKind, wId: string) => `${userId}|${kind}|${wId}`
  for (const row of await db
    .select({
      userId: xpEvent.userId,
      kind: xpEvent.kind,
      weekId: xpEvent.weekId,
      amount: sum(xpEvent.amount),
      rows: count(),
    })
    .from(xpEvent)
    .where(inArray(xpEvent.kind, ['result', 'golden_ear']))
    .groupBy(xpEvent.userId, xpEvent.kind, xpEvent.weekId))
    if (row.weekId !== null)
      ledger.set(key(row.userId, row.kind as SealedKind, row.weekId), {
        amount: Number(row.amount ?? 0),
        rows: row.rows,
      })
  const owned = new Map<string, Map<string, string | null>>()
  for (const row of await db
    .select({
      userId: achievementUnlock.userId,
      id: achievementUnlock.achievementId,
      weekId: achievementUnlock.weekId,
    })
    .from(achievementUnlock)
    .where(inArray(achievementUnlock.achievementId, [...SEALING_ACHIEVEMENTS]))) {
    const mine = owned.get(row.userId) ?? new Map<string, string | null>()
    mine.set(row.id, row.weekId)
    owned.set(row.userId, mine)
  }
  const stored = new Map<string, StreakState>()
  for (const row of await db.select().from(streakState))
    stored.set(row.userId, {
      current: row.current,
      best: row.best,
      lastWeekNumber: row.lastWeekNumber,
      jokerSeason: row.jokerSeason,
    })

  // Los campeones de la temporada, si con esta semana queda cerrada (o se re-sella una semana de una cerrada).
  const champions = await seasonChampionChange(db, { weekId, snapshot, now })
  const grantChamp = new Set(champions?.grant ?? [])
  const withdrawChamp = new Set(champions?.withdraw ?? [])

  // A quién puede cambiar: quien tiene entrada, XP del sellado o un logro de resultado en las semanas que se re-juegan,
  // quien gana el oído de oro, quien tiene racha (si no participa, la pierde o gasta el comodín) y quien gana o pierde
  // `season_champ`. Solo cuentas que existen: lo de una cuenta borrada no vuelve.
  const scope = new Set<string>([...earWinners, ...grantChamp, ...withdrawChamp])
  for (const wId of touched) for (const userId of entries.get(wId)?.keys() ?? []) scope.add(userId)
  for (const k of ledger.keys()) {
    const [userId, , wId] = k.split('|') as [string, string, string]
    if (touched.has(wId)) scope.add(userId)
  }
  for (const [userId, mine] of owned)
    for (const wId of mine.values()) if (wId !== null && touched.has(wId)) scope.add(userId)
  for (const [userId, state] of stored) if (state.current > 0) scope.add(userId)
  const accounts = scope.size
    ? new Set(
        (
          await db
            .select({ id: user.id })
            .from(user)
            .where(inArray(user.id, [...scope]))
        ).map((u) => u.id),
      )
    : new Set<string>()

  const guard: Guard = sql`EXISTS (
    SELECT 1 FROM week
    WHERE week.id = ${weekId} AND week.sealed_at IS NOT NULL AND week.result_revision = ${revision}
  )`
  const statements: BatchStatement[] = []
  for (const userId of [...accounts].sort()) {
    const facts: SealedWeekFacts[] = weeks.map((w) => ({
      weekId: w.id,
      number: w.number,
      seasonId: w.seasonId,
      golden: w.golden,
      qualifiedEntries: qualified.get(w.id) ?? 0,
      entry: entries.get(w.id)?.get(userId) ?? null,
      goldenEar:
        w.id === weekId
          ? earWinners.has(userId)
          : (ledger.get(key(userId, 'golden_ear', w.id))?.amount ?? 0) > 0,
    }))
    const outcomes = replaySealedWeeks(facts)
    const mine: BatchStatement[] = []

    // El XP de resultado y de oído de oro de cada semana re-jugada: el que da la revisión vigente.
    const settle = (kind: SealedKind, wId: string, amount: number) => {
      const current = ledger.get(key(userId, kind, wId)) ?? { amount: 0, rows: 0 }
      if (current.amount === amount) return
      mine.push(
        xpMovementStatement(
          db,
          {
            id: newId(),
            userId,
            kind,
            ref: current.rows === 0 ? wId : `${wId}#${weekId}:${revision}`,
            weekId: wId,
            amount: amount - current.amount,
            now,
          },
          undefined,
          guard,
        ),
      )
    }
    for (const o of outcomes)
      if (touched.has(o.weekId)) {
        settle('result', o.weekId, o.resultXp)
        settle('golden_ear', o.weekId, o.goldenEarXp)
      }

    // Los logros de resultado: se ganan en la primera semana re-jugada que los cumple; se retiran si se ganaron en una
    // de ellas y ya no se cumplen en ninguna semana sellada. Los de semanas anteriores no se tocan.
    const first = new Map<AchievementId, string>()
    const anywhere = new Set<AchievementId>()
    for (const o of outcomes)
      for (const id of o.achievements) {
        anywhere.add(id)
        if (touched.has(o.weekId) && !first.has(id)) first.set(id, o.weekId)
      }
    const has = owned.get(userId) ?? new Map<string, string | null>()
    for (const id of SEALING_ACHIEVEMENTS) {
      const wId = first.get(id)
      if (!has.has(id) && wId !== undefined)
        mine.push(
          ...unlockStatements(
            db,
            { userId, achievementId: id, ref: wId, weekId: wId, now },
            { id: newId(), amount: achievementXp(id) },
            guard,
          ),
        )
      const from = has.get(id)
      if (has.has(id) && !anywhere.has(id) && from != null && touched.has(from))
        mine.push(...withdrawStatements(db, { userId, achievementId: id }, guard))
    }

    // Campeón de la temporada que cierra (o que deja de serlo al re-sellar).
    if (champions && grantChamp.has(userId))
      mine.push(
        ...championUnlock(
          db,
          { userId, seasonId: champions.seasonId, lastWeekId: champions.lastWeekId, now, newId },
          guard,
        ),
      )
    if (withdrawChamp.has(userId))
      mine.push(...withdrawStatements(db, { userId, achievementId: 'season_champ' }, guard))

    if (mine.length > 0)
      statements.push(
        ...mine,
        ...level20Statements(
          db,
          { userId, weekId, now, xpId: newId(), amount: achievementXp('level_20') },
          guard,
        ),
        refreshXpStatement(db, userId),
      )

    // La racha guardada: la que dan las semanas selladas.
    const final = outcomes.at(-1)?.streak ?? STREAK_START
    const before = stored.get(userId)
    if (before ? !sameStreak(before, final) : final.best > 0 || final.jokerSeason !== null)
      statements.push(streakStatement(db, userId, final, guard))
  }
  return statements
}
