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

import {
  type AchievementId,
  evaluate,
  nightOwlWindow,
  type PreviousEntry,
  type SealedEntry,
} from './achievements'
import { assertIntegerInRange } from './internal/guards'
import { advanceStreak, isJuryComplete, STREAK_START, type StreakState, streakInPlay, xpFor } from './xp'

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

// ─── La historia de una cuenta, re-jugada (tarea 7.16, el reprocesado) ─────────────────────────────────────────────
//
// `replayAccount` da todo lo que la capa de juego habría dado a una cuenta si hubiera existido desde el principio: el
// libro de XP ideal (subir, primera entrada de la semana, votos con su tope, jurado completo, resultado y oído de oro)
// y el primer hecho que cumple cada logro, recorriendo sus hechos **en orden de calendario** (descargas, entradas,
// votos, semanas selladas, temporadas que ganó y el perfil). Cada movimiento y cada logro llevan el instante de su
// hecho. Quien llama (el reprocesado del servidor) lo compara con lo que ya hay en el libro y escribe solo lo que
// falta. No cuenta `share_card` ni `level_20` (lo decide el servidor con el libro real) ni los de las Fases 8 y 9.

/** Una semana programada, con lo que la capa de juego mira de ella. */
export interface HistoryWeek {
  readonly weekId: string
  readonly number: number
  readonly seasonId: string
  readonly golden: boolean
  /** `week.submit_ends_at` (para `last_minute`). */
  readonly submitEndsAt: number
}

/** La primera descarga del sample de una semana. */
export interface HistoryDownload {
  readonly weekId: string
  readonly at: number
}

/** Una entrada que llegó a `active` (las que se quedaron en `processing` o fallaron no cuentan). */
export interface HistoryEntry {
  readonly entryId: string
  readonly weekId: string
  /** Cuando pasó a `active` (`entry.submitted_at`, que es también el instante de `last_minute`). */
  readonly at: number
  /** Es la primera entrada de toda su semana (la fila `first_entry_of_week` de esa semana es de esta cuenta). */
  readonly firstOfWeek: boolean
}

/** Un voto de la cuenta (uno por entrada; los anulados también, que conservan su XP). */
export interface HistoryVote {
  readonly entryId: string
  readonly weekId: string
  readonly at: number
}

/** Una semana sellada vista por la cuenta, con el instante del sellado. */
export interface HistorySealedWeek extends SealedWeekFacts {
  readonly sealedAt: number
}

/** Una temporada cerrada de la que la cuenta es campeona (o campeona ex aequo). */
export interface HistoryChampionship {
  readonly seasonId: string
  /** La última semana de la temporada (la del logro en el libro). */
  readonly lastWeekId: string
  /** Cuando se cerró la temporada. */
  readonly at: number
}

/** El perfil tal como está (no se sabe cuándo se completó: `at` es un instante que seguro es anterior). */
export interface HistoryProfile {
  readonly hasAvatar: boolean
  readonly hasBio: boolean
  readonly links: number
  readonly at: number
}

/** Los hechos de una cuenta. Las listas pueden venir en cualquier orden, salvo `sealed` (por número). */
export interface AccountHistory {
  /** Las semanas que citan los hechos. */
  readonly weeks: readonly HistoryWeek[]
  readonly downloads: readonly HistoryDownload[]
  readonly entries: readonly HistoryEntry[]
  readonly votes: readonly HistoryVote[]
  /** Por semana, las entradas activas ajenas (las que cuentan para el jurado completo). */
  readonly votable: Readonly<Record<string, readonly string[]>>
  /** Todas las semanas selladas, también las que no jugó, en orden estricto de número. */
  readonly sealed: readonly HistorySealedWeek[]
  readonly championships: readonly HistoryChampionship[]
  readonly profile: HistoryProfile | null
}

/** Los tipos del libro que da la historia (los de §4.11 sin `achievement`, que pone quien llama, ni `producer_guess`). */
export type ReplayedXpKind =
  | 'entry'
  | 'first_entry_of_week'
  | 'vote'
  | 'jury_complete'
  | 'result'
  | 'golden_ear'

/** Un movimiento del libro ideal, con la referencia de su tipo (§4.11) y el instante de su hecho. */
export interface ReplayedMovement {
  readonly kind: ReplayedXpKind
  readonly ref: string
  readonly weekId: string
  /** Un entero > 0 (los de 0 no dejan fila). */
  readonly amount: number
  readonly at: number
}

/** El primer hecho que cumple un logro: lo que lo desbloquea, su semana y su instante. */
export interface ReplayedUnlock {
  readonly id: AchievementId
  readonly ref: string | null
  readonly weekId: string | null
  readonly at: number
}

/** Lo que da la historia de una cuenta, en orden de calendario. */
export interface ReplayedAccount {
  readonly movements: readonly ReplayedMovement[]
  readonly achievements: readonly ReplayedUnlock[]
  /** La racha tras la última semana sellada (`streak_state`). */
  readonly streak: StreakState
}

type Fact =
  | { readonly type: 0; readonly at: number; readonly tie: string; readonly download: HistoryDownload }
  | { readonly type: 1; readonly at: number; readonly tie: string; readonly entry: HistoryEntry }
  | { readonly type: 2; readonly at: number; readonly tie: string; readonly vote: HistoryVote }
  | {
      readonly type: 3
      readonly at: number
      readonly tie: string
      readonly week: HistorySealedWeek
      readonly outcome: SealedWeekOutcome
    }
  | {
      readonly type: 4
      readonly at: number
      readonly tie: string
      readonly championship: HistoryChampionship
    }
  | { readonly type: 5; readonly at: number; readonly tie: string; readonly profile: HistoryProfile }

/** Orden de calendario; a igual instante, por tipo de hecho (descarga, entrada, voto, sellado…) y por id. */
function byCalendar(a: Fact, b: Fact): number {
  if (a.at !== b.at) return a.at - b.at
  if (a.type !== b.type) return a.type - b.type
  return a.tie < b.tie ? -1 : a.tie > b.tie ? 1 : 0
}

/** Cuántos instantes de `sorted` (ascendente) son ≥ `from`. */
function countFrom(sorted: readonly number[], from: number): number {
  let lo = 0
  let hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if ((sorted[mid] as number) < from) lo = mid + 1
    else hi = mid
  }
  return sorted.length - lo
}

function finiteInstant(at: number, name: string): number {
  if (!Number.isFinite(at)) throw new RangeError(`${name} debe ser un instante finito (recibido: ${at})`)
  return at
}

/** Los hechos de la historia, en orden de calendario. */
function calendarOf(
  history: AccountHistory,
  weekOf: (weekId: string) => HistoryWeek,
  outcomes: readonly SealedWeekOutcome[],
): Fact[] {
  const facts: Fact[] = []
  for (const download of history.downloads) {
    weekOf(download.weekId)
    facts.push({ type: 0, at: finiteInstant(download.at, 'download.at'), tie: download.weekId, download })
  }
  for (const entry of history.entries) {
    weekOf(entry.weekId)
    facts.push({ type: 1, at: finiteInstant(entry.at, 'entry.at'), tie: entry.entryId, entry })
  }
  for (const vote of history.votes) {
    weekOf(vote.weekId)
    facts.push({ type: 2, at: finiteInstant(vote.at, 'vote.at'), tie: vote.entryId, vote })
  }
  history.sealed.forEach((week, i) => {
    facts.push({
      type: 3,
      at: finiteInstant(week.sealedAt, 'sealed.sealedAt'),
      tie: String(week.number).padStart(16, '0'),
      week,
      outcome: outcomes[i] as SealedWeekOutcome,
    })
  })
  for (const championship of history.championships)
    facts.push({
      type: 4,
      at: finiteInstant(championship.at, 'championship.at'),
      tie: championship.seasonId,
      championship,
    })
  if (history.profile)
    facts.push({
      type: 5,
      at: finiteInstant(history.profile.at, 'profile.at'),
      tie: '',
      profile: history.profile,
    })
  return facts.sort(byCalendar)
}

/**
 * Re-juega la historia de una cuenta (guía §2.10, §4.11; tarea 7.16): el libro de XP que habría escrito la capa de
 * juego en vivo y el primer hecho de cada logro, en orden de calendario.
 *
 * - **Subir** paga una vez por semana con la racha en juego (la que dejan las semanas selladas anteriores, más esta) y
 *   la semana dorada; la **primera entrada** de la semana, si la de la cuenta lo es (`firstOfWeek`), con `early_bird`.
 * - **Votar**: 5 XP por el primer voto a cada entrada, con el tope de 40 por semana contado en orden de calendario; el
 *   **jurado completo**, al votar la última de las entradas activas ajenas de la semana (5 o más).
 * - **Sellar**: lo de `replaySealedWeeks` (resultado con la racha en juego, oído de oro, racha y logros de resultado),
 *   en el instante del sellado; **ganar una temporada** da `season_champ` al cerrarse la primera.
 *
 * Determinista e independiente del orden de las listas de entrada (salvo `sealed`, que va por número). `RangeError` si
 * un hecho cita una semana que no está en `weeks` o un instante no es finito.
 */
export function replayAccount(history: AccountHistory): ReplayedAccount {
  const weeks = new Map(history.weeks.map((w) => [w.weekId, w]))
  const weekOf = (weekId: string): HistoryWeek => {
    const found = weeks.get(weekId)
    if (!found) throw new RangeError(`La semana ${weekId} no está en la historia`)
    return found
  }
  const outcomes = replaySealedWeeks(history.sealed)
  /** La racha que dejan las semanas selladas antes de la de número `number`. */
  const streakBefore = (number: number): StreakState => {
    let state: StreakState = STREAK_START
    for (const outcome of outcomes) {
      if (outcome.number >= number) break
      state = outcome.streak
    }
    return state
  }

  const movements: ReplayedMovement[] = []
  const achievements: ReplayedUnlock[] = []
  const unlocked = new Set<AchievementId>()
  const unlock = (ids: readonly AchievementId[], ref: string | null, weekId: string | null, at: number) => {
    for (const id of ids) {
      if (unlocked.has(id)) continue
      unlocked.add(id)
      achievements.push({ id, ref, weekId, at })
    }
  }
  const entryWeeks = new Set<string>()
  const firstWeeks = new Set<string>()
  const votedEntries = new Set<string>()
  const votedByWeek = new Map<string, Set<string>>()
  const votesWithXp = new Map<string, number>()
  const juryDone = new Set<string>()
  const voteTimes: number[] = []

  for (const fact of calendarOf(history, weekOf, outcomes)) {
    switch (fact.type) {
      case 0:
        unlock(
          evaluate({ kind: 'sampleDownloaded' }, { unlocked }),
          fact.download.weekId,
          fact.download.weekId,
          fact.at,
        )
        break
      case 1: {
        const { entry } = fact
        const week = weekOf(entry.weekId)
        const context = { goldenWeek: week.golden, streakWeeks: streakInPlay(streakBefore(week.number)) }
        // Subir paga una vez por semana; la primera entrada, una por semana para toda la batalla.
        if (!entryWeeks.has(week.weekId)) {
          entryWeeks.add(week.weekId)
          movements.push({
            kind: 'entry',
            ref: week.weekId,
            weekId: week.weekId,
            amount: xpFor({ kind: 'entry' }, context),
            at: fact.at,
          })
        }
        if (entry.firstOfWeek && !firstWeeks.has(week.weekId)) {
          firstWeeks.add(week.weekId)
          movements.push({
            kind: 'first_entry_of_week',
            ref: week.weekId,
            weekId: week.weekId,
            amount: xpFor({ kind: 'firstEntryOfWeek' }, context),
            at: fact.at,
          })
        }
        unlock(
          evaluate(
            {
              kind: 'entryActivated',
              entriesTotal: entryWeeks.size,
              firstOfWeek: entry.firstOfWeek,
              submittedAt: entry.at,
              submitEndsAt: week.submitEndsAt,
              goldenWeek: week.golden,
            },
            { unlocked },
          ),
          entry.entryId,
          week.weekId,
          fact.at,
        )
        break
      }
      case 2: {
        const { vote } = fact
        // Un voto por entrada: el primero es el que cuenta.
        if (votedEntries.has(vote.entryId)) break
        votedEntries.add(vote.entryId)
        const week = weekOf(vote.weekId)
        const window = nightOwlWindow(fact.at)
        const nightVotes = window ? countFrom(voteTimes, window.startsAt) + 1 : 0
        voteTimes.push(fact.at)
        const context = { goldenWeek: week.golden, streakWeeks: 0 }
        const withXp = votesWithXp.get(week.weekId) ?? 0
        const amount = xpFor({ kind: 'vote', firstVoteToEntry: true, votesWithXpThisWeek: withXp }, context)
        if (amount > 0) {
          votesWithXp.set(week.weekId, withXp + 1)
          movements.push({ kind: 'vote', ref: vote.entryId, weekId: week.weekId, amount, at: fact.at })
        }
        const votable = new Set(history.votable[week.weekId] ?? [])
        const mine = votedByWeek.get(week.weekId) ?? new Set<string>()
        if (votable.has(vote.entryId)) mine.add(vote.entryId)
        votedByWeek.set(week.weekId, mine)
        const voted = mine.size
        if (!juryDone.has(week.weekId) && isJuryComplete(voted, votable.size)) {
          juryDone.add(week.weekId)
          movements.push({
            kind: 'jury_complete',
            ref: week.weekId,
            weekId: week.weekId,
            amount: xpFor(
              { kind: 'juryComplete', votedEntries: voted, votableEntries: votable.size },
              context,
            ),
            at: fact.at,
          })
        }
        unlock(
          evaluate(
            {
              kind: 'voteCast',
              votesTotal: votedEntries.size,
              castAt: fact.at,
              nightVotes,
              votedEntries: voted,
              votableEntries: votable.size,
            },
            { unlocked },
          ),
          vote.entryId,
          week.weekId,
          fact.at,
        )
        break
      }
      case 3: {
        const { week, outcome } = fact
        if (outcome.resultXp > 0)
          movements.push({
            kind: 'result',
            ref: week.weekId,
            weekId: week.weekId,
            amount: outcome.resultXp,
            at: fact.at,
          })
        if (outcome.goldenEarXp > 0)
          movements.push({
            kind: 'golden_ear',
            ref: week.weekId,
            weekId: week.weekId,
            amount: outcome.goldenEarXp,
            at: fact.at,
          })
        unlock(outcome.achievements, week.weekId, week.weekId, fact.at)
        break
      }
      case 4:
        unlock(
          evaluate({ kind: 'seasonClosed', champion: true }, { unlocked }),
          fact.championship.seasonId,
          fact.championship.lastWeekId,
          fact.at,
        )
        break
      case 5: {
        const { hasAvatar, hasBio, links } = fact.profile
        unlock(
          evaluate({ kind: 'profileUpdated', hasAvatar, hasBio, links }, { unlocked }),
          null,
          null,
          fact.at,
        )
        break
      }
    }
  }
  return { movements, achievements, streak: outcomes.at(-1)?.streak ?? STREAK_START }
}
