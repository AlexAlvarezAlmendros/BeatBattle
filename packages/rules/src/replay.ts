// Lo que da el sellado, re-jugado (guía §2.8, §2.10, Anexo C, Anexo G; tarea 7.10): la parte de la capa de juego que
// depende de la clasificación —el XP de resultado, el oído de oro, la racha y los logros de resultado— es una función
// de las semanas selladas de una cuenta en su revisión vigente. `replaySealedWeeks` la calcula semana a semana; el
// servidor la usa al sellar y al re-sellar para dejar el libro igual a lo que da la revisión vigente (hueco G2), y el
// reprocesado (7.16), para repartir lo que ya pasó.
//
// - **Racha** con `advanceStreak`, en orden de número. Un número que falta en la historia (una semana aún sin sellar)
//   no rompe ni salva nada: se salta, como un hueco del calendario.
// - **XP de resultado**: `xpFor` con la **racha en juego** de la semana (la que dejan las anteriores, más esta) y la
//   semana dorada; 0 sin entrada o sin clasificar.
// - **Oído de oro**: el de la semana (lo decide `goldenEar` al sellarla), con su semana dorada.
// - **Logros de resultado** (los que mira `weekSealed`): los que **se cumplen** en esa semana, se tuvieran o no; quien
//   llama decide cuáles son nuevos. `double` y `comeback` miran la semana de número anterior; `oracle`, las de número
//   consecutivo con oído de oro.
//
// Nada de esto toca la clasificación (`RF-GAME-10`): recibe el snapshot ya calculado.

import { type AchievementId, evaluate, type PreviousEntry, type SealedEntry } from './achievements'
import { assertIntegerInRange } from './internal/guards'
import { advanceStreak, STREAK_START, type StreakState, streakInPlay, xpFor } from './xp'

/** Una semana sellada vista por una cuenta (con su revisión vigente del snapshot). */
export interface SealedWeekFacts {
  readonly weekId: string
  /** `week.number`: correlativo entre las semanas programadas. */
  readonly number: number
  /** Temporada de la semana (la del comodín). */
  readonly seasonId: string
  readonly golden: boolean
  /** Entradas clasificadas de la semana (para el `comeback` de la siguiente). */
  readonly qualifiedEntries: number
  /** Su entrada en el snapshot vigente, o `null` si no tenía (o se retiró o descalificó). */
  readonly entry: SealedEntry | null
  /** Ganó el oído de oro esa semana. */
  readonly goldenEar: boolean
}

/** Lo que da el sellado de una semana a esa cuenta. */
export interface SealedWeekOutcome {
  readonly weekId: string
  readonly number: number
  /** XP de resultado (clasificar, top 10 o podio, × racha en juego, × 2 en dorada); 0 sin entrada clasificada. */
  readonly resultXp: number
  /** XP del oído de oro (× 2 en dorada); 0 si no lo ganó. */
  readonly goldenEarXp: number
  /** La racha tras aplicar la semana. */
  readonly streak: StreakState
  /** Logros de resultado que se cumplen en esta semana, en el orden del catálogo (se tuvieran o no). */
  readonly achievements: readonly AchievementId[]
}

/** Lo que guarda el recorrido de la semana anterior. */
interface Previous {
  readonly number: number
  readonly entry: SealedEntry | null
  readonly qualifiedEntries: number
  readonly goldenEarStreak: number
}

const NOTHING_UNLOCKED: ReadonlySet<AchievementId> = new Set()

/**
 * Re-juega las semanas selladas de una cuenta, en orden estricto de número (`RangeError` si no lo están): para cada una,
 * el XP de resultado y de oído de oro, la racha tras ella y los logros de resultado que se cumplen.
 */
export function replaySealedWeeks(weeks: readonly SealedWeekFacts[]): SealedWeekOutcome[] {
  const out: SealedWeekOutcome[] = []
  let state: StreakState = STREAK_START
  let wins = 0
  let previous: Previous | null = null
  for (const week of weeks) {
    assertIntegerInRange(week.number, 1, Number.MAX_SAFE_INTEGER, 'week.number')
    assertIntegerInRange(week.qualifiedEntries, 0, Number.MAX_SAFE_INTEGER, 'week.qualifiedEntries')
    if (previous !== null && week.number <= previous.number)
      throw new RangeError(
        `Las semanas van en orden de número (la ${week.number} tras la ${previous.number})`,
      )
    // Una semana sin sellar en medio no cuenta: se salta, como un hueco del calendario.
    const last = state.lastWeekNumber
    const before: StreakState =
      last !== null && week.number > last + 1 ? { ...state, lastWeekNumber: week.number - 1 } : state
    const position = week.entry?.position ?? null
    state = advanceStreak(before, {
      number: week.number,
      seasonId: week.seasonId,
      qualified: position !== null,
    })
    const resultXp =
      week.entry === null
        ? 0
        : xpFor({ kind: 'result', position }, { goldenWeek: week.golden, streakWeeks: streakInPlay(before) })
    const goldenEarXp = week.goldenEar
      ? xpFor({ kind: 'goldenEar' }, { goldenWeek: week.golden, streakWeeks: 0 })
      : 0
    if (position === 1) wins += 1
    const prior: Previous | null = previous !== null && previous.number === week.number - 1 ? previous : null
    const goldenEarStreak: number = week.goldenEar ? (prior?.goldenEarStreak ?? 0) + 1 : 0
    const previousEntry: PreviousEntry | null =
      prior?.entry != null
        ? { position: prior.entry.position, qualifiedEntries: prior.qualifiedEntries }
        : null
    const achievements = evaluate(
      {
        kind: 'weekSealed',
        entry: week.entry,
        previousEntry,
        winsTotal: wins,
        streak: state.current,
        goldenEarStreak,
      },
      { unlocked: NOTHING_UNLOCKED },
    )
    out.push({ weekId: week.weekId, number: week.number, resultXp, goldenEarXp, streak: state, achievements })
    previous = {
      number: week.number,
      entry: week.entry,
      qualifiedEntries: week.qualifiedEntries,
      goldenEarStreak,
    }
  }
  return out
}
