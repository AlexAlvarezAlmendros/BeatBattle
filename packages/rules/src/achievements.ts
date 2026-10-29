// Logros (guía §2.10, Anexo C): el catálogo como datos y su evaluación por eventos. Cada logro dice qué eventos lo
// miran y qué fase trae su disparador; la condición vive aquí desde la Fase 7, también la de los que dispara la F8
// (secretos, «Adivina el productor») o la F9 (la Elección del sello) (`RF-GAME-05`).
//
// - `evaluate(evento, contexto)` devuelve los logros nuevos que desbloquea un evento, en el orden del catálogo y sin
//   repetir los que ya tiene la cuenta. Ningún logro se retira (Anexo C), así que basta con mirar hacia delante.
// - Los hechos que hacen falta (recuentos, posiciones, la racha, el oído de oro) van en el evento: los calcula quien
//   llama a partir de la base de datos, en el mismo `batch` que el hecho.
// - Las franjas horarias (`night_owl`, `revetlla`) van en hora de Madrid, la de la semana, con el reloj del servidor.
//
// Los textos (nombre, condición y pista) son de i18n: `achievement.<id>.name` y, en los ocultos, `hintKey`.
// Nada de esto toca la clasificación (`RF-GAME-10`).

import {
  type AchievementRarity,
  CHALLENGE_MAX_POSITION,
  DETECTIVE_MIN_GUESSES,
  ENTRIES_10_MIN_ENTRIES,
  ENTRIES_50_MIN_ENTRIES,
  KONAMI_SEQUENCE,
  LAST_MINUTE_WINDOW_MS,
  LEVEL_MAX,
  NIGHT_OWL_FROM,
  NIGHT_OWL_MIN_VOTES,
  NIGHT_OWL_UNTIL,
  ORACLE_MIN_WEEKS,
  PAD_404_MIN_HITS,
  PODIUM_SIZE,
  PROFILE_DONE_MIN_LINKS,
  REVETLLA_FROM,
  REVETLLA_UNTIL,
  SCRATCH_CLICKS,
  SCRATCH_WINDOW_MS,
  SCREWED_HOLD_MS,
  STREAK_3_MIN_WEEKS,
  STREAK_8_MIN_WEEKS,
  STREAK_26_MIN_WEEKS,
  TAP_TEMPO_TAPS,
  TAP_TEMPO_TOLERANCE_BPM,
  UNANIMOUS_MIN_MEAN_MILLI,
  UNANIMOUS_MIN_VOTES,
  VOTES_100_MIN_VOTES,
  VOTES_1000_MIN_VOTES,
  WEEK_TIME_ZONE,
  WIN_3_MIN_WINS,
} from './balance'
import { localDateOf, zonedInstant } from './calendar'
import { assertFinite, assertIntegerInRange } from './internal/guards'
import { levelOf } from './levels'
import { isJuryComplete } from './xp'

// ─── Eventos ────────────────────────────────────────────────────────────────────────────────────────────────────

/** El resultado de la propia entrada en la semana que se sella (la revisión vigente del snapshot). */
export interface SealedEntry {
  /** Posición, o `null` sin clasificar. */
  readonly position: number | null
  /** Votos válidos de la entrada. */
  readonly votes: number
  /** Suma de sus estrellas válidas (media = `starsSum / votes`). */
  readonly starsSum: number
  /** Marcó en su ficha que cumple el reto extra (y la semana tiene reto). */
  readonly challengeClaimed: boolean
}

/** Su resultado en la semana anterior por número (para `double` y `comeback`). */
export interface PreviousEntry {
  readonly position: number | null
  /** Entradas clasificadas de esa semana. */
  readonly qualifiedEntries: number
}

/** Un secreto de la Fase 8, con lo que hace falta para comprobarlo. */
export type SecretEvidence =
  /** Instantes (ms) de los clics en el logo. */
  | { readonly secret: 'scratch'; readonly clickTimes: readonly number[] }
  /** Las últimas teclas (`KeyboardEvent.key`). */
  | { readonly secret: 'konami'; readonly keys: readonly string[] }
  /** Golpes del bucle grabado en el beat pad del 404. */
  | { readonly secret: 'pad_404'; readonly loopHits: number }
  /** Tiempo con Espacio mantenido sobre el vinilo del sample. */
  | { readonly secret: 'screwed'; readonly holdMs: number }
  /** Tempo marcado con *tap tempo* y el del sample (`null` si el sample no tiene BPM). */
  | {
      readonly secret: 'human_metronome'
      readonly taps: number
      readonly tappedBpm: number
      readonly sampleBpm: number | null
    }
  /** Instante de la visita (lo pone el servidor). */
  | { readonly secret: 'revetlla'; readonly at: number }

/** Un evento que puede desbloquear logros. */
export type AchievementEvent =
  | { readonly kind: 'sampleDownloaded' }
  | {
      readonly kind: 'entryActivated'
      /** Semanas con una entrada que llegó a `active`, incluida esta. */
      readonly entriesTotal: number
      /** Es la primera entrada de la semana en pasar a `active` (§2.10). */
      readonly firstOfWeek: boolean
      /** `entry.submitted_at`. */
      readonly submittedAt: number
      /** `week.submit_ends_at`. */
      readonly submitEndsAt: number
      readonly goldenWeek: boolean
    }
  | {
      readonly kind: 'profileUpdated'
      readonly hasAvatar: boolean
      readonly hasBio: boolean
      readonly links: number
    }
  | {
      readonly kind: 'voteCast'
      /** Votos que tiene la cuenta, uno por entrada, incluido este. */
      readonly votesTotal: number
      /** Instante del voto. */
      readonly castAt: number
      /** Votos a entradas distintas emitidos en la franja de `night_owl` de esa noche, incluido este. */
      readonly nightVotes: number
      /** Entradas activas ajenas de la semana que ha votado, y las que puede votar. */
      readonly votedEntries: number
      readonly votableEntries: number
    }
  | { readonly kind: 'cardShared' }
  | {
      readonly kind: 'weekSealed'
      /** Su entrada en la semana, o `null` si no tenía (o la retiró). */
      readonly entry: SealedEntry | null
      /** Su entrada en la semana anterior por número, o `null`. */
      readonly previousEntry: PreviousEntry | null
      /** Victorias en total, incluida esta semana. */
      readonly winsTotal: number
      /** Racha tras aplicar esta semana (`advanceStreak`). */
      readonly streak: number
      /** Semanas de número consecutivo con oído de oro acabando en esta (0 si esta no lo tiene). */
      readonly goldenEarStreak: number
    }
  | { readonly kind: 'seasonClosed'; readonly champion: boolean }
  | { readonly kind: 'xpChanged'; readonly xp: number }
  | ({ readonly kind: 'secretFound' } & SecretEvidence)
  | { readonly kind: 'guessResolved'; readonly correctTotal: number }
  | { readonly kind: 'labelPicked' }

export type AchievementEventKind = AchievementEvent['kind']

// ─── Catálogo (Anexo C) ─────────────────────────────────────────────────────────────────────────────────────────

/** Los 36 logros del Anexo C, en su orden. */
export const ACHIEVEMENT_IDS = Object.freeze([
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
] as const)

export type AchievementId = (typeof ACHIEVEMENT_IDS)[number]

/** Fase que trae el disparador de un logro (su condición ya está aquí). */
export type AchievementPhase = 7 | 8 | 9

/** Un logro del catálogo. */
export interface Achievement {
  readonly id: AchievementId
  readonly rarity: AchievementRarity
  /** Oculto: se ve «???» con la pista hasta conseguirlo. */
  readonly hidden: boolean
  /** Clave i18n de la pista de un logro oculto, o `null` si se ve. */
  readonly hintKey: string | null
  /** Eventos que lo miran. */
  readonly events: readonly AchievementEventKind[]
  readonly phase: AchievementPhase
}

type Row = readonly [
  id: AchievementId,
  rarity: AchievementRarity,
  hidden: boolean,
  events: readonly AchievementEventKind[],
  phase: AchievementPhase,
]

const ROWS: readonly Row[] = [
  ['first_drop', 'common', false, ['sampleDownloaded'], 7],
  ['first_entry', 'common', false, ['entryActivated'], 7],
  ['profile_done', 'common', false, ['profileUpdated'], 7],
  ['first_vote', 'common', false, ['voteCast'], 7],
  ['share_card', 'common', false, ['cardShared'], 7],
  ['early_bird', 'rare', false, ['entryActivated'], 7],
  ['streak_3', 'rare', false, ['weekSealed'], 7],
  ['entries_10', 'rare', false, ['entryActivated'], 7],
  ['jury_full', 'rare', false, ['voteCast'], 7],
  ['votes_100', 'rare', false, ['voteCast'], 7],
  ['podium', 'rare', false, ['weekSealed'], 7],
  ['challenge', 'rare', false, ['weekSealed'], 7],
  ['streak_8', 'epic', false, ['weekSealed'], 7],
  ['entries_50', 'epic', false, ['entryActivated'], 7],
  ['win', 'epic', false, ['weekSealed'], 7],
  ['unanimous', 'epic', false, ['weekSealed'], 7],
  ['votes_1000', 'epic', false, ['voteCast'], 7],
  ['golden_ear', 'epic', false, ['weekSealed'], 7],
  ['label_pick', 'epic', false, ['labelPicked'], 9],
  ['streak_26', 'legendary', false, ['weekSealed'], 7],
  ['win_3', 'legendary', false, ['weekSealed'], 7],
  ['season_champ', 'legendary', false, ['seasonClosed'], 7],
  ['level_20', 'legendary', false, ['xpChanged'], 7],
  ['last_minute', 'rare', true, ['entryActivated'], 7],
  ['night_owl', 'rare', true, ['voteCast'], 7],
  ['scratch', 'rare', true, ['secretFound'], 8],
  ['konami', 'rare', true, ['secretFound'], 8],
  ['pad_404', 'rare', true, ['secretFound'], 8],
  ['screwed', 'rare', true, ['secretFound'], 8],
  ['human_metronome', 'epic', true, ['secretFound'], 8],
  ['detective', 'epic', true, ['guessResolved'], 8],
  ['comeback', 'epic', true, ['weekSealed'], 7],
  ['golden_week', 'epic', true, ['entryActivated'], 7],
  ['double', 'legendary', true, ['weekSealed'], 7],
  ['oracle', 'legendary', true, ['weekSealed'], 7],
  ['revetlla', 'rare', true, ['secretFound'], 8],
]

/** El catálogo del Anexo C, en su orden. */
export const ACHIEVEMENTS: readonly Achievement[] = Object.freeze(
  ROWS.map(([id, rarity, hidden, events, phase]) =>
    Object.freeze({
      id,
      rarity,
      hidden,
      hintKey: hidden ? `achievement.${id}.hint` : null,
      events: Object.freeze([...events]),
      phase,
    }),
  ),
)

const BY_ID = new Map<string, Achievement>(ACHIEVEMENTS.map((a) => [a.id, a]))

/** ¿Es un id del catálogo? (para validar lo que llega de fuera, como la vitrina o la ruta de los secretos). */
export function isAchievementId(value: unknown): value is AchievementId {
  return typeof value === 'string' && BY_ID.has(value)
}

/** Un logro del catálogo por su id. */
export function achievementById(id: AchievementId): Achievement {
  const found = BY_ID.get(id)
  if (!found) throw new RangeError(`No hay ningún logro ${id}`)
  return found
}

// ─── Franjas horarias (hora de Madrid) ──────────────────────────────────────────────────────────────────────────

/** Una franja de instantes UTC: `[startsAt, endsAt)`. */
export interface InstantWindow {
  readonly startsAt: number
  readonly endsAt: number
}

/**
 * La franja de `night_owl` (03:00–05:00 en hora de Madrid) que contiene `instant`, o `null` si cae fuera. Quien llama
 * cuenta en ella los votos de la noche.
 */
export function nightOwlWindow(instant: number, timeZone: string = WEEK_TIME_ZONE): InstantWindow | null {
  assertFinite(instant, 'instant')
  const day = localDateOf(instant, timeZone)
  const startsAt = zonedInstant(day, NIGHT_OWL_FROM, timeZone)
  const endsAt = zonedInstant(day, NIGHT_OWL_UNTIL, timeZone)
  return startsAt <= instant && instant < endsAt ? { startsAt, endsAt } : null
}

/** ¿Cae `instant` en la noche de Sant Joan (del 23 de junio a las 21:00 al 24 a las 06:00, en hora de Madrid)? */
export function isRevetllaNight(instant: number, timeZone: string = WEEK_TIME_ZONE): boolean {
  assertFinite(instant, 'instant')
  const { year } = localDateOf(instant, timeZone)
  const from = zonedInstant(
    { year, month: REVETLLA_FROM.month, day: REVETLLA_FROM.day },
    REVETLLA_FROM,
    timeZone,
  )
  const until = zonedInstant(
    { year, month: REVETLLA_UNTIL.month, day: REVETLLA_UNTIL.day },
    REVETLLA_UNTIL,
    timeZone,
  )
  return from <= instant && instant < until
}

// ─── Condiciones ────────────────────────────────────────────────────────────────────────────────────────────────

function count(value: number, name: string): number {
  assertIntegerInRange(value, 0, Number.MAX_SAFE_INTEGER, name)
  return value
}

/** Por debajo de la mediana de las clasificadas: `2 · posición > clasificadas + 1`. */
function inLowerHalf(previous: PreviousEntry | null): boolean {
  if (previous === null || previous.position === null) return false
  return 2 * previous.position > count(previous.qualifiedEntries, 'qualifiedEntries') + 1
}

function scratchDone(clickTimes: readonly number[]): boolean {
  for (let i = 0; i + SCRATCH_CLICKS - 1 < clickTimes.length; i++) {
    const first = clickTimes[i] as number
    const last = clickTimes[i + SCRATCH_CLICKS - 1] as number
    if (last >= first && last - first <= SCRATCH_WINDOW_MS) return true
  }
  return false
}

function konamiDone(keys: readonly string[]): boolean {
  if (keys.length < KONAMI_SEQUENCE.length) return false
  const tail = keys.slice(keys.length - KONAMI_SEQUENCE.length)
  return tail.every((key, i) => {
    const expected = KONAMI_SEQUENCE[i] as string
    return expected.length === 1 ? key.toLowerCase() === expected : key === expected
  })
}

type Condition = (event: AchievementEvent) => boolean

const CONDITIONS: Record<AchievementId, Condition> = {
  first_drop: (e) => e.kind === 'sampleDownloaded',
  first_entry: (e) => e.kind === 'entryActivated' && count(e.entriesTotal, 'entriesTotal') >= 1,
  profile_done: (e) =>
    e.kind === 'profileUpdated' &&
    e.hasAvatar &&
    e.hasBio &&
    count(e.links, 'links') >= PROFILE_DONE_MIN_LINKS,
  first_vote: (e) => e.kind === 'voteCast' && count(e.votesTotal, 'votesTotal') >= 1,
  share_card: (e) => e.kind === 'cardShared',
  early_bird: (e) => e.kind === 'entryActivated' && e.firstOfWeek,
  streak_3: (e) => e.kind === 'weekSealed' && count(e.streak, 'streak') >= STREAK_3_MIN_WEEKS,
  entries_10: (e) =>
    e.kind === 'entryActivated' && count(e.entriesTotal, 'entriesTotal') >= ENTRIES_10_MIN_ENTRIES,
  jury_full: (e) => e.kind === 'voteCast' && isJuryComplete(e.votedEntries, e.votableEntries),
  votes_100: (e) => e.kind === 'voteCast' && count(e.votesTotal, 'votesTotal') >= VOTES_100_MIN_VOTES,
  podium: (e) => e.kind === 'weekSealed' && e.entry?.position != null && e.entry.position <= PODIUM_SIZE,
  challenge: (e) =>
    e.kind === 'weekSealed' &&
    e.entry !== null &&
    e.entry.challengeClaimed &&
    e.entry.position !== null &&
    e.entry.position <= CHALLENGE_MAX_POSITION,
  streak_8: (e) => e.kind === 'weekSealed' && count(e.streak, 'streak') >= STREAK_8_MIN_WEEKS,
  entries_50: (e) =>
    e.kind === 'entryActivated' && count(e.entriesTotal, 'entriesTotal') >= ENTRIES_50_MIN_ENTRIES,
  win: (e) => e.kind === 'weekSealed' && e.entry?.position === 1,
  unanimous: (e) => {
    if (e.kind !== 'weekSealed' || e.entry === null) return false
    const votes = count(e.entry.votes, 'votes')
    // Media ≥ 4,8 sin dividir: Σ · 1000 ≥ 4800 · n.
    return votes >= UNANIMOUS_MIN_VOTES && e.entry.starsSum * 1000 >= UNANIMOUS_MIN_MEAN_MILLI * votes
  },
  votes_1000: (e) => e.kind === 'voteCast' && count(e.votesTotal, 'votesTotal') >= VOTES_1000_MIN_VOTES,
  golden_ear: (e) => e.kind === 'weekSealed' && count(e.goldenEarStreak, 'goldenEarStreak') >= 1,
  label_pick: (e) => e.kind === 'labelPicked',
  streak_26: (e) => e.kind === 'weekSealed' && count(e.streak, 'streak') >= STREAK_26_MIN_WEEKS,
  win_3: (e) => e.kind === 'weekSealed' && count(e.winsTotal, 'winsTotal') >= WIN_3_MIN_WINS,
  season_champ: (e) => e.kind === 'seasonClosed' && e.champion,
  level_20: (e) => e.kind === 'xpChanged' && levelOf(e.xp) >= LEVEL_MAX,
  last_minute: (e) =>
    e.kind === 'entryActivated' &&
    e.submitEndsAt - LAST_MINUTE_WINDOW_MS <= e.submittedAt &&
    e.submittedAt < e.submitEndsAt,
  night_owl: (e) =>
    e.kind === 'voteCast' &&
    count(e.nightVotes, 'nightVotes') >= NIGHT_OWL_MIN_VOTES &&
    nightOwlWindow(e.castAt) !== null,
  scratch: (e) => e.kind === 'secretFound' && e.secret === 'scratch' && scratchDone(e.clickTimes),
  konami: (e) => e.kind === 'secretFound' && e.secret === 'konami' && konamiDone(e.keys),
  pad_404: (e) =>
    e.kind === 'secretFound' && e.secret === 'pad_404' && count(e.loopHits, 'loopHits') >= PAD_404_MIN_HITS,
  screwed: (e) => e.kind === 'secretFound' && e.secret === 'screwed' && e.holdMs >= SCREWED_HOLD_MS,
  human_metronome: (e) =>
    e.kind === 'secretFound' &&
    e.secret === 'human_metronome' &&
    e.sampleBpm !== null &&
    count(e.taps, 'taps') >= TAP_TEMPO_TAPS &&
    Math.abs(e.tappedBpm - e.sampleBpm) <= TAP_TEMPO_TOLERANCE_BPM,
  detective: (e) =>
    e.kind === 'guessResolved' && count(e.correctTotal, 'correctTotal') >= DETECTIVE_MIN_GUESSES,
  comeback: (e) =>
    e.kind === 'weekSealed' &&
    e.entry?.position != null &&
    e.entry.position <= PODIUM_SIZE &&
    inLowerHalf(e.previousEntry),
  golden_week: (e) => e.kind === 'entryActivated' && e.goldenWeek,
  double: (e) => e.kind === 'weekSealed' && e.entry?.position === 1 && e.previousEntry?.position === 1,
  oracle: (e) => e.kind === 'weekSealed' && count(e.goldenEarStreak, 'goldenEarStreak') >= ORACLE_MIN_WEEKS,
  revetlla: (e) => e.kind === 'secretFound' && e.secret === 'revetlla' && isRevetllaNight(e.at),
}

/** Lo que ya sabe la cuenta. */
export interface AchievementContext {
  /** Los logros que ya tiene (`achievement_unlock`). */
  readonly unlocked: ReadonlySet<AchievementId>
}

/**
 * Logros nuevos que desbloquea `event` (guía §2.10, Anexo C, `RF-GAME-05`): los del catálogo que miran ese evento,
 * cumplen su condición y la cuenta aún no tiene, en el orden del catálogo y sin duplicados.
 */
export function evaluate(event: AchievementEvent, context: AchievementContext): AchievementId[] {
  return ACHIEVEMENTS.filter(
    (a) => a.events.includes(event.kind) && !context.unlocked.has(a.id) && CONDITIONS[a.id](event),
  ).map((a) => a.id)
}
