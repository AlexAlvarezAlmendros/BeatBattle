import {
  ACHIEVEMENT_IDS,
  type AchievementId,
  isAchievementId,
  jokerAvailable,
  levelOf,
  mondayOf,
  seasonOf,
  seasonStandings,
} from '@beatbattle/rules'
import type {
  AchievementUnlock,
  EntryCover,
  MeGame,
  ProfileGame,
  ProfileHistoryRow,
  SeasonSummary,
} from '@beatbattle/shared'
import { and, count, desc, eq, isNotNull, isNull, type SQL, sql } from 'drizzle-orm'
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core'
import type { Db } from '../../db/client'
import {
  achievementUnlock,
  entry,
  producerProfile,
  result,
  seenFlag,
  vote,
  week,
  xpEvent,
} from '../../db/schema'
import { lastClosedSeason, sealedSeasonResults } from '../seasons/repo'
import { streakOfAccount } from './repo'

/**
 * Lo que la capa de juego enseña (guía §1.3, §2.3, §2.10, §2.15; tarea 7.13, hueco G1).
 *
 * **Lo público solo cuenta semanas selladas.** El XP de subir se gana al pasar la entrada a `active` y el de votar, al
 * votar (§2.10): si el perfil público sumara el XP o enseñara un `first_entry` o un `early_bird` a mitad de semana,
 * diría quién participa en una batalla ciega, justo lo que §2.15 evita en el sitemap y en la imagen OG. Así que el
 * perfil público (XP, nivel, estadísticas, historial, logros y vitrina), la clasificación de la temporada y el salón de
 * la fama solo cuentan lo que tiene una semana sellada (`week_id` de una semana con `sealed_at`) y lo que no es de
 * ninguna semana (`week_id` nulo). Eso último no dice nada de una batalla: hoy es el perfil completo (`profile_done`,
 * con un avatar, una bio y un enlace que ya son públicos), compartir una tarjeta (`share_card`, que la persona hace
 * pública ella misma, y que también vale con la carta) y `level_20` cuando lo cruza uno de ellos; todo hecho que
 * dependa de jugar una semana (subir, votar, descargar el sample, adivinar el productor y, cuando la 7.28 lo conecte,
 * compartir la tarjeta de la batalla de una entrada sin sellar) lleva su `week_id`.
 *
 * **`GET /api/me` es de su dueño** y va en vivo: su XP de verdad, la racha, la temporada, los logros sin ver y la
 * ceremonia de temporada pendiente.
 */

/** La condición de lo público sobre una columna `week_id`: sin semana, o de una semana sellada. */
export const publicWeek = (column: AnySQLiteColumn): SQL =>
  sql`(${column} IS NULL OR ${column} IN (SELECT week.id FROM week WHERE week.sealed_at IS NOT NULL))`

const catalogOrder = (a: AchievementId, b: AchievementId) =>
  ACHIEVEMENT_IDS.indexOf(a) - ACHIEVEMENT_IDS.indexOf(b)

/** El XP público de una cuenta: la suma del libro sin lo de semanas sin sellar. */
export async function publicXp(db: Db, userId: string): Promise<number> {
  const [row] = await db
    .select({ xp: sql<number>`coalesce(sum(${xpEvent.amount}), 0)` })
    .from(xpEvent)
    .where(and(eq(xpEvent.userId, userId), publicWeek(xpEvent.weekId)))
  return Math.max(0, Number(row?.xp ?? 0))
}

/** Los logros públicos de una cuenta (sin los de semanas sin sellar), en el orden del catálogo. */
export async function publicUnlocks(db: Db, userId: string): Promise<AchievementUnlock[]> {
  const rows = await db
    .select({ id: achievementUnlock.achievementId, unlockedAt: achievementUnlock.unlockedAt })
    .from(achievementUnlock)
    .where(and(eq(achievementUnlock.userId, userId), publicWeek(achievementUnlock.weekId)))
  return rows
    .filter((row): row is AchievementUnlock => isAchievementId(row.id))
    .sort((a, b) => catalogOrder(a.id, b.id))
}

/** La vitrina guardada (`producer_profile.showcase`, JSON), solo con ids del catálogo. */
export function parseShowcase(raw: string): AchievementId[] {
  try {
    const value = JSON.parse(raw) as unknown
    return Array.isArray(value) ? value.filter(isAchievementId) : []
  } catch {
    return []
  }
}

/** La temporada en curso (la del lunes de `now`) de una cuenta: sus puntos y su puesto, con solo semanas selladas. */
export async function seasonSummary(db: Db, userId: string, now: number): Promise<SeasonSummary> {
  const id = seasonOf(mondayOf(now))
  const mine = seasonStandings(await sealedSeasonResults(db, id)).find((row) => row.userId === userId)
  return { id, points: mine?.points ?? 0, position: mine?.position ?? null }
}

/** La portada de una entrada sellada (la da el servicio de entradas). */
export type SealedCover = (row: { coverPublicId: string | null; coverSeed: number }) => EntryCover

const generative: SealedCover = (row) => ({ kind: 'generative', seed: row.coverSeed })

/**
 * La capa de juego del perfil público (§2.3, §3.8.10; `RF-PRF-01`): nivel con el XP público, las seis teselas, el
 * historial de combates, los logros públicos y la vitrina (de la elegida, solo los públicos). Todo de semanas selladas.
 */
export async function profileGame(
  db: Db,
  input: { userId: string; showcase: readonly AchievementId[]; now: number; cover?: SealedCover },
): Promise<ProfileGame> {
  const { userId, now } = input
  const cover = input.cover ?? generative
  const rows = await db
    .select({
      weekSlug: week.slug,
      weekNumber: week.number,
      entryId: entry.id,
      alias: entry.alias,
      title: entry.title,
      coverPublicId: entry.coverPublicId,
      coverSeed: entry.coverSeed,
      votes: result.votes,
      position: result.position,
      scoreMilli: result.scoreMilli,
    })
    .from(result)
    .innerJoin(week, and(eq(week.id, result.weekId), eq(week.resultRevision, result.revision)))
    .innerJoin(entry, eq(entry.id, result.entryId))
    .where(and(isNotNull(week.sealedAt), eq(entry.userId, userId)))
    .orderBy(desc(week.number))
  const history: ProfileHistoryRow[] = rows.map(({ coverPublicId, coverSeed, ...row }) => ({
    ...row,
    cover: cover({ coverPublicId, coverSeed }),
  }))
  const qualified = history.filter((row) => row.position !== null)
  // Semanas con oído de oro (el del sellado, con sus ajustes): cuántas, nunca los votos (`RNF-PRIV-04`).
  const ears = await db
    .select({ weekId: xpEvent.weekId })
    .from(xpEvent)
    .where(and(eq(xpEvent.userId, userId), eq(xpEvent.kind, 'golden_ear'), publicWeek(xpEvent.weekId)))
    .groupBy(xpEvent.weekId)
    .having(sql`sum(${xpEvent.amount}) > 0`)
  // Votos dados en semanas selladas: los que contó su snapshot (a entradas que están en él, sin anulados).
  const [cast] = await db
    .select({ n: count() })
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
    .where(and(eq(vote.userId, userId), eq(vote.voided, false)))
  const streak = await streakOfAccount(db, userId)
  const achievements = await publicUnlocks(db, userId)
  const visible = new Set(achievements.map((a) => a.id))
  return {
    level: levelOf(await publicXp(db, userId)),
    stats: {
      bestPosition: qualified.length ? Math.min(...qualified.map((row) => row.position as number)) : null,
      streak: { current: streak.current, best: streak.best },
      meanScoreMilli: qualified.length
        ? Math.round(qualified.reduce((sum, row) => sum + row.scoreMilli, 0) / qualified.length)
        : null,
      goldenEars: ears.length,
      votesCast: cast?.n ?? 0,
      season: await seasonSummary(db, userId, now),
    },
    history,
    achievements,
    showcase: input.showcase.filter((id) => visible.has(id)).slice(0, 3),
  }
}

/**
 * La capa de juego de `GET /api/me` (tarea 7.13): la de su dueño, en vivo. La racha y el comodín son los de las semanas
 * selladas (la caché `streak_state`), con el comodín de la temporada en curso.
 */
export async function meGame(db: Db, userId: string, now: number): Promise<MeGame> {
  const [profile] = await db
    .select({ xp: producerProfile.xp, levelSeen: producerProfile.levelSeen })
    .from(producerProfile)
    .where(eq(producerProfile.userId, userId))
  const xp = Math.max(0, profile?.xp ?? 0)
  const streak = await streakOfAccount(db, userId)
  const season = await seasonSummary(db, userId, now)
  const unseen = await db
    .select({ id: achievementUnlock.achievementId })
    .from(achievementUnlock)
    .where(and(eq(achievementUnlock.userId, userId), isNull(achievementUnlock.seenAt)))
  const last = await lastClosedSeason(db, now)
  let seasonCeremony: MeGame['seasonCeremony'] = null
  if (last && last.champions.length > 0) {
    const [seen] = await db
      .select({ at: seenFlag.seenAt })
      .from(seenFlag)
      .where(
        and(
          eq(seenFlag.userId, userId),
          eq(seenFlag.kind, 'season_champion'),
          eq(seenFlag.ref, last.seasonId),
        ),
      )
    if (!seen) seasonCeremony = { seasonId: last.seasonId, champion: last.champions.includes(userId) }
  }
  return {
    xp,
    level: levelOf(xp),
    levelSeen: Math.min(20, Math.max(1, profile?.levelSeen ?? 1)),
    streak: { current: streak.current, best: streak.best, jokerAvailable: jokerAvailable(streak, season.id) },
    season,
    unseenAchievements: unseen
      .map((row) => row.id)
      .filter(isAchievementId)
      .sort(catalogOrder),
    seasonCeremony,
  }
}
