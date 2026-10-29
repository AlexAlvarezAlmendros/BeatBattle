import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import {
  AchievementIdSchema,
  BROWSER_ACHIEVEMENTS,
  DeclaredAchievementSchema,
  EntryCreatedSchema,
  GameDeltaSchema,
  HallOfFameSchema,
  MeGameSchema,
  ProfileGameSchema,
  SeasonIdSchema,
  SeasonStandingsSchema,
  SeenRequestSchema,
  ShowcaseSchema,
  VoteCastSchema,
  VoteSchema,
} from '../src'

/** Todas las claves de un esquema de objetos, también las de dentro (objetos, listas, nulos y opcionales). */
function keysOf(schema: z.ZodType, out: string[] = []): string[] {
  const def = (schema as unknown as { def?: Record<string, unknown> }).def ?? {}
  const shape = (schema as unknown as { shape?: Record<string, z.ZodType> }).shape
  if (shape)
    for (const [key, inner] of Object.entries(shape)) {
      out.push(key)
      keysOf(inner, out)
    }
  for (const inner of ['innerType', 'element'] as const) if (def[inner]) keysOf(def[inner] as z.ZodType, out)
  return out
}

describe('esquemas de la capa de juego (§2.9, §2.10, §4.10; tarea 7.7)', () => {
  it('RF-GAME-08 (contrato): lo que gana un hecho dice el XP, los logros nuevos y el nivel', () => {
    const delta = { xp: 80, achievements: ['first_vote'], level: 1 }
    expect(GameDeltaSchema.parse(delta)).toEqual(delta)
    for (const bad of [
      { ...delta, xp: -5 },
      { ...delta, xp: 2.5 },
      { ...delta, achievements: ['inventado'] },
      { ...delta, level: 21 },
      { ...delta, level: 0 },
    ])
      expect(GameDeltaSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false)
  })

  it('RF-GAME-08 (contrato): el voto y la entrada registrada responden lo ganado (`game`, tarea 7.9)', () => {
    const vote = { entryId: 'e-1', stars: 4, createdAt: 1, updatedAt: 2 }
    const game = { xp: 30, achievements: ['first_vote'], level: 1 }
    expect(VoteCastSchema.parse({ ...vote, game })).toEqual({ ...vote, game })
    expect(VoteCastSchema.safeParse(vote).success).toBe(false)
    // «Mis votos» sigue sin `game`.
    expect(VoteSchema.safeParse({ ...vote, game }).success).toBe(false)
    expect(Object.keys(EntryCreatedSchema.shape)).toContain('game')
    expect(EntryCreatedSchema.shape.game).toBe(GameDeltaSchema)
  })

  it('RF-GAME-05 (contrato): el navegador solo declara los logros de su lista blanca (en la Fase 7, share_card)', () => {
    expect([...BROWSER_ACHIEVEMENTS]).toEqual(['share_card'])
    for (const id of BROWSER_ACHIEVEMENTS) expect(AchievementIdSchema.options).toContain(id)
    expect(DeclaredAchievementSchema.parse({ achievement: 'share_card' })).toEqual({
      achievement: 'share_card',
    })
    for (const bad of [{ achievement: 'win' }, { achievement: 'share_card', xp: 25 }, {}])
      expect(DeclaredAchievementSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false)
  })

  it('RF-GAME-05: los 36 logros del Anexo C, sin repetir', () => {
    expect(AchievementIdSchema.options).toHaveLength(36)
    expect(new Set(AchievementIdSchema.options).size).toBe(36)
    expect(AchievementIdSchema.safeParse('golden_ear').success).toBe(true)
    expect(AchievementIdSchema.safeParse('GOLDEN_EAR').success).toBe(false)
  })

  it('RF-ARC-04 (contrato): una temporada es el trimestre de su año («2026-T4»)', () => {
    for (const id of ['2026-T1', '2026-T4']) expect(SeasonIdSchema.safeParse(id).success, id).toBe(true)
    for (const id of ['2026-T5', '2026-T0', '2026-4', 'T4'])
      expect(SeasonIdSchema.safeParse(id).success, id).toBe(false)
  })

  it('RF-GAME-09 (contrato): me lleva el nivel visto, la racha con el comodín, la temporada, los logros sin ver y la ceremonia de temporada', () => {
    const game = {
      xp: 3400,
      level: 8,
      levelSeen: 7,
      streak: { current: 3, best: 5, jokerAvailable: true },
      season: { id: '2026-T4', points: 12, position: 9 },
      unseenAchievements: ['streak_3'],
      seasonCeremony: { seasonId: '2026-T3', champion: false },
    }
    expect(MeGameSchema.parse(game)).toEqual(game)
    expect(MeGameSchema.safeParse({ ...game, season: null, seasonCeremony: null }).success).toBe(true)
    expect(
      MeGameSchema.safeParse({ ...game, seasonCeremony: { seasonId: 'T3', champion: true } }).success,
    ).toBe(false)
  })

  it('RF-GAME-09, RF-ARC-05 (contrato): lo ya visto admite el nivel, un logro y la ceremonia de una temporada', () => {
    for (const ok of [
      { kind: 'drop', ref: '2026-w42' },
      { kind: 'ceremony', ref: '2026-w42' },
      { kind: 'level', ref: 8 },
      { kind: 'achievement', ref: 'win' },
      { kind: 'season_champion', ref: '2026-T4' },
    ])
      expect(SeenRequestSchema.safeParse(ok).success, JSON.stringify(ok)).toBe(true)
    for (const bad of [
      { kind: 'level', ref: 0 },
      { kind: 'level', ref: 21 },
      { kind: 'level', ref: '8' },
      { kind: 'achievement', ref: 'nope' },
      { kind: 'season_champion', ref: '2026-w42' },
      { kind: 'ceremony', ref: '2026-T4' },
      { kind: 'level', ref: 3, extra: true },
    ])
      expect(SeenRequestSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false)
  })

  it('RF-PRF-01 (contrato): la vitrina admite hasta tres logros distintos del catálogo', () => {
    expect(ShowcaseSchema.safeParse(['win', 'podium', 'first_vote']).success).toBe(true)
    expect(ShowcaseSchema.safeParse([]).success).toBe(true)
    for (const bad of [['win', 'podium', 'first_vote', 'oracle'], ['win', 'win'], ['nope']])
      expect(ShowcaseSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false)
  })

  it('RNF-PRIV-04: el perfil, la temporada y el salón de la fama no tienen sitio para votos individuales', () => {
    const banned = ['stars', 'myVote', 'votesGiven', 'userId', 'email', 'rho', 'spearman']
    for (const schema of [ProfileGameSchema, SeasonStandingsSchema, HallOfFameSchema]) {
      const keys = keysOf(schema)
      expect(keys.length).toBeGreaterThan(5)
      for (const key of banned) expect(keys, key).not.toContain(key)
    }
    // El recorrido baja por listas y nulos: el nombre del productor de cada ganador está dentro de los dos.
    expect(keysOf(HallOfFameSchema)).toEqual(
      expect.arrayContaining(['weeklyWinners', 'username', 'scoreMilli']),
    )
  })

  it('RF-PRF-01 (contrato): el perfil admite como mucho tres logros en la vitrina', () => {
    const profile = {
      level: 4,
      stats: {
        bestPosition: 2,
        streak: { current: 1, best: 3 },
        meanScoreMilli: 3912,
        goldenEars: 1,
        votesCast: 140,
        season: { id: '2026-T4', points: 30, position: 4 },
      },
      history: [
        {
          weekSlug: '2026-w41',
          weekNumber: 40,
          entryId: 'e1',
          alias: 'Faro Errante',
          title: 'Bruma',
          cover: { kind: 'generative', seed: 7 },
          votes: 41,
          position: 2,
          scoreMilli: 4410,
        },
      ],
      achievements: [{ id: 'podium', unlockedAt: 1 }],
      showcase: ['podium'],
    }
    expect(ProfileGameSchema.parse(profile)).toEqual(profile)
    expect(
      ProfileGameSchema.safeParse({ ...profile, showcase: ['podium', 'win', 'first_vote', 'first_drop'] })
        .success,
    ).toBe(false)
  })

  it('RF-ARC-03 (contrato): la clasificación de temporada lleva puntos, victorias, podios y media; quien se borró es null', () => {
    const standings = {
      season: { id: '2026-T4', sealedWeeks: 13, closed: true },
      rows: [
        {
          position: 1,
          producer: { username: 'kairo', displayName: 'Kairo', avatarUrl: null },
          points: 120,
          wins: 3,
          podiums: 6,
          weeks: 12,
          meanScoreMilli: 4100,
        },
        { position: 1, producer: null, points: 120, wins: 3, podiums: 6, weeks: 11, meanScoreMilli: 4100 },
      ],
    }
    expect(SeasonStandingsSchema.parse(standings)).toEqual(standings)
    expect(
      SeasonStandingsSchema.safeParse({
        ...standings,
        rows: [{ ...standings.rows[0], weeks: 0 }],
      }).success,
    ).toBe(false)
  })

  it('RF-ARC-02 (contrato): el salón de la fama lleva ganadores, campeones y los cuatro récords', () => {
    const hall = {
      weeklyWinners: [
        {
          weekSlug: '2026-w41',
          weekNumber: 40,
          entryId: 'e1',
          alias: 'Faro Errante',
          title: 'Bruma',
          cover: { kind: 'generative', seed: 7 },
          producer: null,
        },
      ],
      seasonChampions: [{ seasonId: '2026-T4', producers: [null] }],
      records: {
        mostWins: { producer: null, value: 3 },
        longestStreak: null,
        bestScore: { producer: null, scoreMilli: 4800, weekSlug: '2026-w41', entryId: 'e1' },
        mostVotesCast: null,
      },
    }
    expect(HallOfFameSchema.parse(hall)).toEqual(hall)
    expect(
      HallOfFameSchema.safeParse({ ...hall, seasonChampions: [{ seasonId: '2026-T4', producers: [] }] })
        .success,
    ).toBe(false)
  })
})
