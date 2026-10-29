import type { SeasonWrapPayload } from '@beatbattle/emails'
import {
  ACHIEVEMENT_IDS,
  type AchievementId,
  achievementById,
  isAchievementId,
  type SeasonResult,
  seasonChampions,
  seasonEndsAt,
  seasonStandings,
} from '@beatbattle/rules'
import { and, count, eq, gte, inArray, isNotNull, isNull, lt, ne, or } from 'drizzle-orm'
import type { BatchStatement } from '../../db/batch'
import type { Db } from '../../db/client'
import { achievementUnlock, result, user, vote, week } from '../../db/schema'
import { enqueueEmail } from '../../email/outbox'
import { achievementXp } from '../game/repo'
import type { WeekSnapshot } from '../results/snapshot'
import { sealedSeasonResults, weeksOfSeason } from './repo'

/**
 * `season.wrap`, «Tu T4 de 2026 en cifras» (guía §2.12, §2.12.7, Anexo H; tarea 7.30, `RF-NOTIF-15`). Se encola en el
 * mismo `batch` que cierra la temporada (§4.19.3): el del sellado de su última semana (`sealingStatements`) o el del
 * `tick` que la cierra sin semana el último lunes (`closeDueSeasons`, hueco G7). A cada cuenta verificada que participó
 * (una entrada en el snapshot de alguna de sus semanas, clasificada o no) o votó (algún voto que contó en ellos): su
 * puesto y sus puntos, los campeones, las semanas jugadas, su mejor puesto, los votos emitidos, los logros de la
 * temporada y su carta (la imagen OG del perfil, que pinta la plantilla). La clave es por cuenta y temporada
 * (`season.wrap:user:<cuenta>:<temporada>`): el `tick` que ve después la temporada ya cerrada no duplica nada
 * (`RF-NOTIF-02`). Preferencia (`season_on`), horas de silencio, tope semanal y baja, al enviar (§2.12.4).
 *
 * **Nada sin sellar** (`RF-NOTIF-13`): todo sale de las semanas de la temporada, selladas o la que se sella en este
 * `batch` (con su snapshot recién calculado). La temporada siguiente puede estar ya en juego: de ella, nada (los logros
 * con semana, solo los de las semanas de esta; los sin semana, los del trimestre).
 */

/** Pasada una semana del cierre, el `tick` ya no reparte el resumen (como los resultados del lunes, §2.12.2). */
export const SEASON_WRAP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/** El trimestre anterior («2027-T1» → «2026-T4»). */
function previousSeason(seasonId: string): string {
  const [year, quarter] = seasonId.split('-T').map(Number) as [number, number]
  return quarter > 1 ? `${year}-T${quarter - 1}` : `${year - 1}-T4`
}

export interface WrapInput {
  seasonId: string
  /** La semana que se sella en este `batch`, con su clasificación recién calculada (aún no guardada). */
  fresh?: { weekId: string; snapshot: WeekSnapshot }
  /** Logros que este mismo `batch` da (con su semana) o retira, por cuenta. */
  granted?: ReadonlyMap<string, readonly { id: AchievementId; weekId: string | null }[]>
  withdrawn?: ReadonlyMap<string, readonly AchievementId[]>
  now: number
  newId: () => string
}

const nameOf = (p: { username: string | null; displayUsername: string | null; name: string }) =>
  p.displayUsername || p.username || p.name

/** Las sentencias que encolan el resumen de la temporada a quien participó o votó en ella. */
export async function seasonWrapStatements(db: Db, input: WrapInput): Promise<BatchStatement[]> {
  const { seasonId, fresh, now, newId } = input
  const weeks = await weeksOfSeason(db, seasonId)
  const weekIds = weeks.map((w) => w.id)
  if (weekIds.length === 0) return []

  // Las filas de la temporada: las guardadas y, si se sella una semana en este `batch`, las suyas recién calculadas.
  const owners = new Map((fresh?.snapshot.entries ?? []).map((e) => [e.id, e.userId]))
  const rows: SeasonResult[] = [
    ...(await sealedSeasonResults(db, seasonId)).filter((row) => row.weekId !== fresh?.weekId),
    ...(fresh?.snapshot.rows ?? []).flatMap((row) => {
      const userId = owners.get(row.entryId)
      return userId
        ? [{ userId, weekId: fresh?.weekId as string, position: row.position, scoreMilli: row.scoreMilli }]
        : []
    }),
  ]
  const standings = seasonStandings(rows)
  const champions = seasonChampions(standings)

  // Votos que contaron: los de los snapshots guardados (a entradas que están en ellos, sin anulados) y los de la semana
  // que se sella.
  const votes = new Map<string, number>()
  for (const row of await db
    .select({ userId: vote.userId, n: count() })
    .from(vote)
    .innerJoin(week, and(eq(week.id, vote.weekId), isNotNull(week.sealedAt), eq(week.seasonId, seasonId)))
    .innerJoin(
      result,
      and(
        eq(result.weekId, vote.weekId),
        eq(result.entryId, vote.entryId),
        eq(result.revision, week.resultRevision),
      ),
    )
    .where(and(eq(vote.voided, false), fresh ? ne(vote.weekId, fresh.weekId) : undefined))
    .groupBy(vote.userId))
    votes.set(row.userId, row.n)
  for (const v of fresh?.snapshot.votes ?? []) votes.set(v.voterId, (votes.get(v.voterId) ?? 0) + 1)

  const players = new Set(rows.map((row) => row.userId))
  const candidates = [...new Set([...players, ...[...votes].filter(([, n]) => n > 0).map(([id]) => id)])]
  if (candidates.length === 0) return []
  const people = await db
    .select({
      id: user.id,
      username: user.username,
      displayUsername: user.displayUsername,
      name: user.name,
      emailVerified: user.emailVerified,
    })
    .from(user)
    .where(inArray(user.id, [...new Set([...candidates, ...champions])]))
  const byId = new Map(people.map((p) => [p.id, p]))
  const recipients = candidates.filter((id) => byId.get(id)?.emailVerified).sort()
  if (recipients.length === 0) return []
  const championNames = champions.map((id) => {
    const person = byId.get(id)
    return person ? nameOf(person) : 'Productor eliminado'
  })

  // Los logros de la temporada: los de sus semanas y los sin semana del trimestre, con lo que da y quita este `batch`.
  const start = seasonEndsAt(previousSeason(seasonId))
  const end = seasonEndsAt(seasonId)
  const unlocks = new Map<string, Set<AchievementId>>()
  const add = (userId: string, id: string) => {
    if (!isAchievementId(id)) return
    const mine = unlocks.get(userId) ?? new Set<AchievementId>()
    mine.add(id)
    unlocks.set(userId, mine)
  }
  for (const row of await db
    .select({ userId: achievementUnlock.userId, id: achievementUnlock.achievementId })
    .from(achievementUnlock)
    .where(
      and(
        inArray(achievementUnlock.userId, recipients),
        or(
          inArray(achievementUnlock.weekId, weekIds),
          and(
            isNull(achievementUnlock.weekId),
            gte(achievementUnlock.unlockedAt, start),
            lt(achievementUnlock.unlockedAt, end),
          ),
        ),
      ),
    ))
    add(row.userId, row.id)
  for (const [userId, list] of input.granted ?? [])
    for (const { id, weekId } of list) if (weekId === null || weekIds.includes(weekId)) add(userId, id)
  for (const [userId, list] of input.withdrawn ?? []) for (const id of list) unlocks.get(userId)?.delete(id)

  return recipients.map((userId) => {
    const person = byId.get(userId) as (typeof people)[number]
    const mine = rows.filter((row) => row.userId === userId)
    const positions = mine.map((row) => row.position).filter((p): p is number => p !== null)
    const standing = standings.find((row) => row.userId === userId)
    const payload: SeasonWrapPayload = {
      seasonId,
      username: person.username,
      standing: standing
        ? {
            position: standing.position,
            total: standings.length,
            points: standing.points,
            wins: standing.wins,
            podiums: standing.podiums,
          }
        : null,
      champions: championNames,
      champion: champions.includes(userId),
      weeksPlayed: new Set(mine.map((row) => row.weekId)).size,
      bestPosition: positions.length ? Math.min(...positions) : null,
      votesCast: votes.get(userId) ?? 0,
      achievements: ACHIEVEMENT_IDS.filter((id) => unlocks.get(userId)?.has(id)).map((id) => ({
        id,
        rarity: achievementById(id).rarity,
        xp: achievementXp(id),
      })),
    }
    return enqueueEmail(db, {
      id: newId(),
      kind: 'season.wrap',
      target: { userId },
      idempotencyKey: `season.wrap:user:${userId}:${seasonId}`,
      payload: payload as unknown as Record<string, unknown>,
      now,
    })
  })
}
