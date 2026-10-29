import { z } from 'zod'
import { EntryCoverSchema, EntryProducerSchema, OwnEntrySchema } from './entries'
import { VoteSchema } from './votes'
import { WeekSlugSchema } from './weeks'

/**
 * Capa de juego (guía §2.9, §2.10, §3.4, §4.10; Fase 7, tarea 7.7): lo que la API dice del XP, los logros, la racha
 * y la temporada. Las reglas (importes, condiciones, niveles, desempates) viven en `@beatbattle/rules`; aquí solo los
 * contratos. Nada de esto entra en la clasificación (`RF-GAME-10`), y lo público nunca lleva votos individuales
 * (`RNF-PRIV-04`) ni nada de una semana sin sellar (§1.3).
 */

/**
 * Los 36 logros del Anexo C, en su orden: la misma lista que `ACHIEVEMENT_IDS` de `@beatbattle/rules` (un test del
 * servidor comprueba que coinciden).
 */
export const AchievementIdSchema = z.enum([
  'first_drop',
  'first_entry',
  'profile_done',
  'first_vote',
  'share_card',
  'early_bird',
  'streak_3',
  'entries_10',
  'jury_full',
  'votes_100',
  'podium',
  'challenge',
  'streak_8',
  'entries_50',
  'win',
  'unanimous',
  'votes_1000',
  'golden_ear',
  'label_pick',
  'streak_26',
  'win_3',
  'season_champ',
  'level_20',
  'last_minute',
  'night_owl',
  'scratch',
  'konami',
  'pad_404',
  'screwed',
  'human_metronome',
  'detective',
  'comeback',
  'golden_week',
  'double',
  'oracle',
  'revetlla',
])

/** Niveles de la curva del Anexo B. */
const levelSchema = z.number().int().min(1).max(20)
const countSchema = z.number().int().min(0)
/** Temporada: el trimestre de su lunes («2026-T4», `RF-ARC-04`). */
export const SeasonIdSchema = z.string().regex(/^\d{4}-T[1-4]$/)

/**
 * Lo que gana un hecho (el voto, la entrada que pasa a `active`…; tarea 7.9): `game` en su respuesta, para el «+5 XP»
 * flotante, el aviso de logro y la subida de nivel (§3.4.2, §3.8.8).
 */
export const GameDeltaSchema = z
  .object({
    /** XP que ha dado este hecho, logros incluidos; 0 si nada (un voto repetido o pasado el tope). */
    xp: countSchema,
    /** Logros nuevos, en el orden del catálogo. */
    achievements: z.array(AchievementIdSchema),
    /** Nivel tras el hecho: si es mayor que el del HUD, sube de nivel. */
    level: levelSchema,
  })
  .strict()
export type GameDelta = z.infer<typeof GameDeltaSchema>

/** `PUT /api/entries/:id/vote` (tarea 7.9): el voto guardado y lo que ha ganado (`RF-GAME-08`, el «+5 XP»). */
export const VoteCastSchema = VoteSchema.extend({ game: GameDeltaSchema }).strict()
export type VoteCast = z.infer<typeof VoteCastSchema>

/**
 * `POST /api/weeks/:slug/entries` y `PUT /api/entries/:id/audio` (tarea 7.9): la entrada propia y lo que ha ganado al
 * pasar a `active`; si queda en `processing`, nada (`xp: 0`): lo da el `tick` cuando la complete.
 */
export const EntryCreatedSchema = OwnEntrySchema.extend({ game: GameDeltaSchema }).strict()
export type EntryCreated = z.infer<typeof EntryCreatedSchema>

/**
 * Los logros que declara el navegador (§4.10, tarea 7.14; hueco G5): solo los de esta lista blanca. En la Fase 7,
 * `share_card` (compartir o descargar una tarjeta); la Fase 8 suma sus secretos, cada uno con su prueba.
 */
export const BROWSER_ACHIEVEMENTS = ['share_card'] as const
export type BrowserAchievement = (typeof BROWSER_ACHIEVEMENTS)[number]

/** `POST /api/me/achievements`: un logro de la lista blanca; cualquier otro → 422. */
export const DeclaredAchievementSchema = z.object({ achievement: z.enum(BROWSER_ACHIEVEMENTS) }).strict()
export type DeclaredAchievement = z.infer<typeof DeclaredAchievementSchema>

/** Un logro conseguido (en el perfil público y en la vitrina): el id y cuándo. */
export const AchievementUnlockSchema = z
  .object({ id: AchievementIdSchema, unlockedAt: z.number().int() })
  .strict()
export type AchievementUnlock = z.infer<typeof AchievementUnlockSchema>

/** La racha (§2.10): actual, la mejor y si le queda el comodín de esta temporada. */
export const StreakSchema = z
  .object({ current: countSchema, best: countSchema, jokerAvailable: z.boolean() })
  .strict()
export type Streak = z.infer<typeof StreakSchema>

/** La temporada en curso de una cuenta, para la tesela del HUD («T4 · 12 PTS · 9.º», §3.4.1). */
export const SeasonSummarySchema = z
  .object({
    id: SeasonIdSchema,
    points: countSchema,
    /** Puesto en la clasificación (solo semanas selladas); `null` si aún no entra (§2.9). */
    position: z.number().int().min(1).nullable(),
  })
  .strict()
export type SeasonSummary = z.infer<typeof SeasonSummarySchema>

/**
 * La ceremonia del campeón de temporada pendiente (§2.9, `RF-ARC-05`): la de la última temporada cerrada con campeón,
 * mientras la cuenta no la marque vista (`POST /api/me/seen` con `season_champion`); `champion` dice si es uno de sus
 * campeones.
 */
export const SeasonCeremonySchema = z.object({ seasonId: SeasonIdSchema, champion: z.boolean() }).strict()
export type SeasonCeremony = z.infer<typeof SeasonCeremonySchema>

/**
 * La capa de juego en `GET /api/me` (tarea 7.13): lo de la propia cuenta, en vivo (también lo de la semana en juego, que
 * lo público aún no cuenta, hueco G1): XP y nivel (el visto, para la subida de nivel una sola vez, `RF-GAME-09`),
 * racha, temporada, los logros cuyo aviso aún no ha visto y la ceremonia de temporada pendiente.
 */
export const MeGameSchema = z
  .object({
    xp: countSchema,
    level: levelSchema,
    levelSeen: levelSchema,
    streak: StreakSchema,
    season: SeasonSummarySchema.nullable(),
    unseenAchievements: z.array(AchievementIdSchema),
    seasonCeremony: SeasonCeremonySchema.nullable(),
  })
  .strict()
export type MeGame = z.infer<typeof MeGameSchema>

/**
 * Las seis teselas del perfil (§3.8.10): mejor puesto, racha, media final, oído de oro, votos dados y temporada.
 * Solo semanas selladas; del oído de oro, cuántas semanas (nunca sus votos, `RNF-PRIV-04`).
 */
export const ProfileStatsSchema = z
  .object({
    bestPosition: z.number().int().min(1).nullable(),
    streak: z.object({ current: countSchema, best: countSchema }).strict(),
    /** Media de la puntuación final (× 1000) de sus entradas clasificadas; `null` sin ninguna. */
    meanScoreMilli: z.number().int().nullable(),
    goldenEars: countSchema,
    votesCast: countSchema,
    season: SeasonSummarySchema.nullable(),
  })
  .strict()
export type ProfileStats = z.infer<typeof ProfileStatsSchema>

/** Una fila del historial de combates (§3.8.10): solo semanas selladas, de la más reciente a la más antigua. */
export const ProfileHistoryRowSchema = z
  .object({
    weekSlug: WeekSlugSchema,
    weekNumber: z.number().int().min(1),
    entryId: z.string(),
    alias: z.string(),
    title: z.string(),
    cover: EntryCoverSchema,
    votes: countSchema,
    position: z.number().int().min(1).nullable(),
    scoreMilli: z.number().int(),
  })
  .strict()
export type ProfileHistoryRow = z.infer<typeof ProfileHistoryRowSchema>

/**
 * La capa de juego del perfil público (§2.3, §3.8.10; tarea 7.13): solo semanas selladas (hueco G1). Los logros son los
 * conseguidos, en el orden del catálogo (los que faltan y los ocultos, «???» con su pista, los pinta la web con el
 * catálogo de `@beatbattle/rules`).
 */
export const ProfileGameSchema = z
  .object({
    level: levelSchema,
    stats: ProfileStatsSchema,
    history: z.array(ProfileHistoryRowSchema),
    achievements: z.array(AchievementUnlockSchema),
    /** Hasta tres logros conseguidos, elegidos en Ajustes → Perfil. */
    showcase: z.array(AchievementIdSchema).max(3),
  })
  .strict()
export type ProfileGame = z.infer<typeof ProfileGameSchema>

/** El productor de una fila pública; `null` = «Productor eliminado» (`RF-PRF-04`). */
const producerSchema = EntryProducerSchema.nullable()

/** Una fila de la clasificación de una temporada (§2.9; `seasonStandings` de `@beatbattle/rules`). */
export const SeasonStandingRowSchema = z
  .object({
    /** Con todo empatado comparten posición (1, 1, 3). */
    position: z.number().int().min(1),
    producer: producerSchema,
    points: countSchema,
    wins: countSchema,
    podiums: countSchema,
    /** Semanas con entrada clasificada. */
    weeks: z.number().int().min(1),
    /** Media de la puntuación (× 1000, redondeada para mostrar; el desempate la compara exacta). */
    meanScoreMilli: z.number().int(),
  })
  .strict()
export type SeasonStandingRow = z.infer<typeof SeasonStandingRowSchema>

/** `GET /api/seasons/:id/standings` (§2.9, tarea 7.11): solo semanas selladas, también la temporada en curso. */
export const SeasonStandingsSchema = z
  .object({
    season: z
      .object({
        id: SeasonIdSchema,
        /** Semanas selladas que cuentan. */
        sealedWeeks: countSchema,
        /**
         * Cerrada (§2.9, hueco G7): ha acabado su trimestre y todas sus semanas están selladas; la primera fila es la de
         * los campeones.
         */
        closed: z.boolean(),
      })
      .strict(),
    rows: z.array(SeasonStandingRowSchema),
  })
  .strict()
export type SeasonStandings = z.infer<typeof SeasonStandingsSchema>

/** Un récord del salón de la fama: quién y la cifra. */
const recordSchema = z.object({ producer: producerSchema, value: countSchema }).strict()

/** `GET /api/hall-of-fame` (§2.9, `RF-ARC-02`, tarea 7.12): derivado de los snapshots vigentes. */
export const HallOfFameSchema = z
  .object({
    /** Ganadores semana a semana, de la más reciente a la más antigua (con ex aequo, todos). */
    weeklyWinners: z.array(
      z
        .object({
          weekSlug: WeekSlugSchema,
          weekNumber: z.number().int().min(1),
          entryId: z.string(),
          alias: z.string(),
          title: z.string(),
          cover: EntryCoverSchema,
          producer: producerSchema,
        })
        .strict(),
    ),
    /** Campeones de temporada (los ex aequo, juntos). */
    seasonChampions: z.array(
      z.object({ seasonId: SeasonIdSchema, producers: z.array(producerSchema).min(1) }).strict(),
    ),
    records: z
      .object({
        mostWins: recordSchema.nullable(),
        longestStreak: recordSchema.nullable(),
        /** La mejor puntuación de la historia (× 1000), con su semana y su entrada. */
        bestScore: z
          .object({
            producer: producerSchema,
            scoreMilli: z.number().int(),
            weekSlug: WeekSlugSchema,
            entryId: z.string(),
          })
          .strict()
          .nullable(),
        mostVotesCast: recordSchema.nullable(),
      })
      .strict(),
  })
  .strict()
export type HallOfFame = z.infer<typeof HallOfFameSchema>
