import { seasonStandings } from '@beatbattle/rules'
import type { SeasonStandings } from '@beatbattle/shared'
import type { Db } from '../../db/client'
import { appError } from '../../lib/errors'
import { producerCards } from '../profile/producers'
import type { ImageStorage } from '../storage/cloudinary'
import { sealDueWeeks } from '../weeks/seal'
import { closedAt, sealedSeasonResults, weeksOfSeason } from './repo'

export interface SeasonsDeps {
  db: Db
  images: ImageStorage | null
  newId: () => string
}

/** Temporadas (guía §2.9, §4.10; tarea 7.11): la clasificación pública, también la de la temporada en curso. */
export function createSeasonsService(deps: SeasonsDeps) {
  const { db } = deps
  return {
    /**
     * `GET /api/seasons/:id/standings` (`RF-ARC-03`): la clasificación con solo las semanas selladas, sus desempates y,
     * cerrada, los campeones en la primera fila. 404 si la temporada aún no ha empezado (ninguna semana suya ha caído).
     */
    async standings(seasonId: string, now: number): Promise<SeasonStandings> {
      // Perezoso, como el archivo: lo que ya cerró cuenta.
      await sealDueWeeks(db, { now, holder: deps.newId(), newId: deps.newId })
      const weeks = await weeksOfSeason(db, seasonId)
      if (!weeks.some((w) => w.startsAt <= now))
        throw appError('NOT_FOUND', 'Esa temporada aún no ha empezado.')
      const table = seasonStandings(await sealedSeasonResults(db, seasonId))
      const producers = await producerCards(
        db,
        deps.images,
        table.map((row) => row.userId),
      )
      return {
        season: {
          id: seasonId,
          sealedWeeks: weeks.filter((w) => w.sealedAt !== null).length,
          closed: closedAt(seasonId, weeks, now),
        },
        rows: table.map((row) => ({
          position: row.position,
          producer: producers.get(row.userId) ?? null,
          points: row.points,
          wins: row.wins,
          podiums: row.podiums,
          weeks: row.weeks,
          meanScoreMilli: Math.round(row.scoreSumMilli / row.weeks),
        })),
      }
    },
  }
}

export type SeasonsService = ReturnType<typeof createSeasonsService>
