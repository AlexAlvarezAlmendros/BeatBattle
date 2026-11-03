import type { HallOfFame } from '@beatbattle/shared'
import { and, count, desc, eq, isNotNull, isNull, or } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { entry, result, user, vote, week } from '../../db/schema'
import type { EntriesService } from '../entries/service'
import { producerCards } from '../profile/producers'
import { championsBySeason } from '../seasons/repo'
import type { ImageStorage } from '../storage/cloudinary'
import { sealDueWeeks } from '../weeks/seal'
import { bestScore, longestStreak, mostVotesCast, mostWins, type RecordWeek } from './records'

export interface HallOfFameDeps {
  db: Db
  images: ImageStorage | null
  entries: EntriesService
  newId: () => string
}

/**
 * El salón de la fama (guía §2.9, §4.10; tarea 7.12, `RF-ARC-02`): ganadores semana a semana, campeones de temporada y
 * récords, todo derivado de los snapshots vigentes de las semanas selladas (un re-sellado lo cambia; nada de una semana
 * sin sellar, §1.3). Un productor eliminado sale como «Productor eliminado» (`producer: null`).
 */
export function createHallOfFameService(deps: HallOfFameDeps) {
  const { db } = deps
  return {
    /** `GET /api/hall-of-fame`. */
    async hallOfFame(now: number): Promise<HallOfFame> {
      await sealDueWeeks(db, { now, holder: deps.newId(), newId: deps.newId })
      const rows = await db
        .select({
          weekId: week.id,
          number: week.number,
          slug: week.slug,
          seasonId: week.seasonId,
          entryId: result.entryId,
          position: result.position,
          scoreMilli: result.scoreMilli,
          userId: entry.userId,
          alias: entry.alias,
          title: entry.title,
          coverPublicId: entry.coverPublicId,
          coverSeed: entry.coverSeed,
          submittedAt: entry.submittedAt,
        })
        .from(result)
        .innerJoin(week, and(eq(week.id, result.weekId), eq(week.resultRevision, result.revision)))
        .innerJoin(entry, eq(entry.id, result.entryId))
        .where(isNotNull(week.sealedAt))
      // Los votos válidos de cada cuenta en cada semana sellada: los que contó su snapshot vigente (a entradas que
      // están en él, sin anulados ni de cuentas bloqueadas).
      const votes = await db
        .select({ weekId: vote.weekId, voterId: vote.userId, n: count() })
        .from(vote)
        .innerJoin(week, and(eq(week.id, vote.weekId), isNotNull(week.sealedAt)))
        .innerJoin(
          result,
          and(
            eq(result.weekId, vote.weekId),
            eq(result.entryId, vote.entryId),
            eq(result.revision, week.resultRevision),
          ),
        )
        .leftJoin(user, eq(user.id, vote.userId))
        .where(and(eq(vote.voided, false), or(isNull(user.banned), eq(user.banned, false))))
        .groupBy(vote.weekId, vote.userId)
      const sealed = await db
        .select({ id: week.id, number: week.number, seasonId: week.seasonId })
        .from(week)
        .where(isNotNull(week.sealedAt))
        .orderBy(desc(week.number))
      const weeks: RecordWeek[] = sealed.map((w) => ({
        ...w,
        rows: rows.filter((row) => row.weekId === w.id),
        votesByVoter: new Map(votes.filter((v) => v.weekId === w.id).map((v) => [v.voterId, v.n])),
      }))

      const winners = rows
        .filter((row) => row.position === 1)
        .sort(
          (a, b) => b.number - a.number || a.submittedAt - b.submittedAt || (a.entryId < b.entryId ? -1 : 1),
        )
      const champions = [...(await championsBySeason(db, now))]
        .filter(([, ids]) => ids.length > 0)
        .sort(([a], [b]) => (a < b ? 1 : -1))
      const records = {
        mostWins: mostWins(weeks),
        longestStreak: longestStreak(weeks),
        bestScore: bestScore(weeks),
        mostVotesCast: mostVotesCast(weeks),
      }
      const producers = await producerCards(db, deps.images, [
        ...winners.map((row) => row.userId),
        ...champions.flatMap(([, ids]) => ids),
        ...[records.mostWins, records.longestStreak, records.bestScore, records.mostVotesCast].flatMap((r) =>
          r ? [r.userId] : [],
        ),
      ])
      const producer = (userId: string) => producers.get(userId) ?? null
      const slugOf = new Map(rows.map((row) => [row.weekId, row.slug]))
      const record = (r: { userId: string; value: number } | null) =>
        r ? { producer: producer(r.userId), value: r.value } : null
      return {
        weeklyWinners: winners.map((row) => ({
          weekSlug: row.slug,
          weekNumber: row.number,
          entryId: row.entryId,
          alias: row.alias,
          title: row.title,
          cover: deps.entries.sealedCover(row),
          producer: producer(row.userId),
        })),
        seasonChampions: champions.map(([seasonId, ids]) => ({ seasonId, producers: ids.map(producer) })),
        records: {
          mostWins: record(records.mostWins),
          longestStreak: record(records.longestStreak),
          bestScore: records.bestScore
            ? {
                producer: producer(records.bestScore.userId),
                scoreMilli: records.bestScore.scoreMilli,
                weekSlug: slugOf.get(records.bestScore.weekId) as string,
                entryId: records.bestScore.entryId,
              }
            : null,
          mostVotesCast: record(records.mostVotesCast),
        },
      }
    },
  }
}

export type HallOfFameService = ReturnType<typeof createHallOfFameService>
