// Reglas de XP (guía §2.10, Anexo B, Anexo G): cuánto XP da cada evento del libro (`xp_event`). La idempotencia
// (una fila por cuenta, tipo y referencia) es del servidor; aquí solo el importe, siempre un entero ≥ 0.
//
// - **Racha en juego** (`streakWeeks`): la que dejan las semanas selladas más la del evento, como si clasificara.
//   Paga el bonus de subir (al pasar a `active`) y el del resultado (al sellar), que así coinciden si clasifica.
// - **Semana dorada**: × 2 a los eventos del Anexo B de esa semana, después de redondear; nunca a los logros.
// - **Redondeo** (Anexo G): `xp = dorada · ⌊(base · (100 + b) + 50) / 100⌋`, el bonus al entero con las mitades
//   hacia arriba.
// - **Topes**: 40 votos con XP por semana (`RF-GAME-03`) y 5 aciertos de productor (Fase 8). Lo ganado en vivo no
//   se retira (guía §2.10): quien llama cuenta los votos con XP de la semana en el libro, también los quitados o
//   anulados.
//
// El XP nunca entra en la clasificación ni en el peso de un voto (`RF-GAME-10`): `ranking` y `scoring` no importan
// este módulo (test estático en `gameIsolation.test.ts`).

import {
  type AchievementRarity,
  GOLDEN_WEEK_XP_MULTIPLIER,
  JURY_COMPLETE_MIN_ENTRIES,
  TOP_TEN_LAST_POSITION,
  XP_ACHIEVEMENT_BY_RARITY,
  XP_ENTRY_SUBMITTED,
  XP_FIRST_ENTRY_OF_WEEK,
  XP_GOLDEN_EAR,
  XP_JURY_COMPLETE,
  XP_PODIUM_BY_POSITION,
  XP_PRODUCER_GUESS,
  XP_PRODUCER_GUESS_MAX_PER_WEEK,
  XP_QUALIFIED,
  XP_TOP_TEN,
  XP_VOTE,
  XP_VOTE_MAX_VOTES_PER_WEEK,
} from './balance'
import { assertIntegerInRange } from './internal/guards'
import { streakBonusPercent } from './levels'

/** Un evento que da XP (Anexo B). Lo que hace falta para decidir su importe va en el propio evento. */
export type XpEvent =
  /** Subir: la entrada pasa a `active` (× racha en juego; una vez por semana). */
  | { readonly kind: 'entry' }
  /** La primera entrada de toda la semana en pasar a `active`. */
  | { readonly kind: 'firstEntryOfWeek' }
  | {
      readonly kind: 'vote'
      /** `false` si ya votó antes esa entrada (aunque después quitara el voto): no vuelve a sumar. */
      readonly firstVoteToEntry: boolean
      /** Votos de la semana que ya dieron XP antes de este, según el libro (también quitados o anulados). */
      readonly votesWithXpThisWeek: number
    }
  | {
      readonly kind: 'juryComplete'
      /** Entradas activas ajenas de la semana que ha votado. */
      readonly votedEntries: number
      /** Entradas activas ajenas de la semana (las que puede votar). */
      readonly votableEntries: number
    }
  /** Resultado al sellar: posición en la semana, o `null` sin clasificar (× racha en juego). */
  | { readonly kind: 'result'; readonly position: number | null }
  /** Oído de oro de la semana (lo decide `goldenEar`). */
  | { readonly kind: 'goldenEar' }
  | {
      readonly kind: 'producerGuess'
      readonly correct: boolean
      /** Aciertos de la semana que ya dieron XP antes de este. */
      readonly guessesWithXpThisWeek: number
    }
  /** Un logro desbloqueado: su XP es el de su rareza, sin racha ni semana dorada. */
  | { readonly kind: 'achievement'; readonly rarity: AchievementRarity }

/** Lo que el evento hereda de su semana y de quien lo gana. */
export interface XpContext {
  /** La semana del evento es dorada (`week.golden`). No afecta a los logros. */
  readonly goldenWeek: boolean
  /**
   * Racha en juego: semanas consecutivas con entrada clasificada que dejan las semanas selladas, más la del evento
   * (guía §2.10). Solo la usan `entry` y `result`.
   */
  readonly streakWeeks: number
}

/** Jurado completo: ha votado todas las entradas activas ajenas de la semana y son al menos 5 (Anexo B). */
export function isJuryComplete(votedEntries: number, votableEntries: number): boolean {
  assertIntegerInRange(votableEntries, 0, Number.MAX_SAFE_INTEGER, 'votableEntries')
  assertIntegerInRange(votedEntries, 0, votableEntries, 'votedEntries')
  return votableEntries >= JURY_COMPLETE_MIN_ENTRIES && votedEntries === votableEntries
}

/** XP base de un resultado: 500 / 350 / 250 del 1.º al 3.º, 100 hasta el 10.º y 25 por clasificar; `0` sin clasificar. */
export function resultBaseXp(position: number | null): number {
  if (position === null) return 0
  assertIntegerInRange(position, 1, Number.MAX_SAFE_INTEGER, 'position')
  const podium = XP_PODIUM_BY_POSITION[position - 1]
  if (podium !== undefined) return podium
  return position <= TOP_TEN_LAST_POSITION ? XP_TOP_TEN : XP_QUALIFIED
}

/** `⌊(base · (100 + b) + 50) / 100⌋`: el bonus de racha al entero, con las mitades hacia arriba (Anexo G). */
function withStreak(base: number, streakWeeks: number): number {
  const scaled = base * (100 + streakBonusPercent(streakWeeks)) + 50
  return (scaled - (scaled % 100)) / 100
}

/** Importe antes de la semana dorada (que lo duplica entero). */
function baseAmount(event: XpEvent, streakWeeks: number): number {
  switch (event.kind) {
    case 'entry':
      return withStreak(XP_ENTRY_SUBMITTED, streakWeeks)
    case 'firstEntryOfWeek':
      return XP_FIRST_ENTRY_OF_WEEK
    case 'vote':
      assertIntegerInRange(event.votesWithXpThisWeek, 0, Number.MAX_SAFE_INTEGER, 'votesWithXpThisWeek')
      return event.firstVoteToEntry && event.votesWithXpThisWeek < XP_VOTE_MAX_VOTES_PER_WEEK ? XP_VOTE : 0
    case 'juryComplete':
      return isJuryComplete(event.votedEntries, event.votableEntries) ? XP_JURY_COMPLETE : 0
    case 'result':
      return withStreak(resultBaseXp(event.position), streakWeeks)
    case 'goldenEar':
      return XP_GOLDEN_EAR
    case 'producerGuess':
      assertIntegerInRange(event.guessesWithXpThisWeek, 0, Number.MAX_SAFE_INTEGER, 'guessesWithXpThisWeek')
      return event.correct && event.guessesWithXpThisWeek < XP_PRODUCER_GUESS_MAX_PER_WEEK
        ? XP_PRODUCER_GUESS
        : 0
    case 'achievement':
      return XP_ACHIEVEMENT_BY_RARITY[event.rarity]
  }
}

/**
 * XP que da un evento (Anexo B, Anexo G): un entero ≥ 0, y `0` cuando el evento no puntúa (un voto repetido o pasado
 * el tope, un jurado incompleto, una entrada sin clasificar o un fallo al adivinar el productor).
 */
export function xpFor(event: XpEvent, context: XpContext): number {
  assertIntegerInRange(context.streakWeeks, 0, Number.MAX_SAFE_INTEGER, 'streakWeeks')
  const amount = baseAmount(event, context.streakWeeks)
  if (event.kind === 'achievement' || !context.goldenWeek) return amount
  return GOLDEN_WEEK_XP_MULTIPLIER * amount
}
