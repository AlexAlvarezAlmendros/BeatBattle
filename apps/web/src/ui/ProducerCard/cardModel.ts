import { RANK_LADDER } from '@beatbattle/rules'
import type { AchievementUnlock, ProfileGame } from '@beatbattle/shared'
import { formatDate } from '../../i18n'

/**
 * Lo que la carta de productor dice de su dueño (guía §3.4.4, §2.10; tarea 7.22), sacado de lo público del perfil
 * (`GET /api/profiles/:username`, solo semanas selladas: hueco G1). Puro: lo usan la carta plana, la vista previa de
 * Ajustes → Perfil y, con la 7.23 y la 7.28, la textura 3D y la tarjeta para *stories*.
 */

/** Variantes de la carta, de menos a más (§3.4.4): todas en la paleta. */
export const CARD_VARIANTS = ['standard', 'red', 'holo', 'champion'] as const
export type CardVariant = (typeof CARD_VARIANTS)[number]

/** Nivel desde el que la carta es roja: el del rango «Productor» (Anexo B). */
export const RED_CARD_LEVEL = RANK_LADDER.find((step) => step.id === 'producer')?.fromLevel ?? Number.NaN

/** Lo que decide la variante. */
export interface CardFacts {
  level: number
  /** Semanas selladas en 1.ª posición (ex aequo incluidos). */
  wins: number
  /** Tiene `season_champ` (campeón o campeón ex aequo de una temporada cerrada, §2.9). */
  champion: boolean
}

/**
 * Las variantes que tiene ganadas, de menos a más: la estándar siempre; la roja con rango ≥ Productor; la holo si ha
 * ganado alguna semana (`egg.holo`, Anexo F); la de campeón si lo ha sido de una temporada.
 */
export function unlockedVariants({ level, wins, champion }: CardFacts): CardVariant[] {
  return CARD_VARIANTS.filter(
    (variant) =>
      variant === 'standard' ||
      (variant === 'red' && level >= RED_CARD_LEVEL) ||
      (variant === 'holo' && wins > 0) ||
      (variant === 'champion' && champion),
  )
}

/** La variante con la que sale la carta: la más alta que tiene ganada. */
export function cardVariant(facts: CardFacts): CardVariant {
  return unlockedVariants(facts).at(-1) ?? 'standard'
}

/** Las tres cifras del anverso: victorias · podios · semanas, del historial de semanas selladas. */
export function cardStats(history: ProfileGame['history']): { wins: number; podiums: number; weeks: number } {
  const weeks = new Set(history.map((row) => row.weekSlug))
  return {
    wins: history.filter((row) => row.position === 1).length,
    podiums: history.filter((row) => row.position !== null && row.position <= 3).length,
    weeks: weeks.size,
  }
}

/** ¿Ha sido campeón de temporada? (`season_champ` entre sus logros públicos). */
export const isChampion = (achievements: readonly AchievementUnlock[]) =>
  achievements.some((unlock) => unlock.id === 'season_champ')

/** «03/2026»: mes y año de alta, en hora de Madrid (el pie del anverso y el reverso). */
export function cardSince(joinedAt: number): string {
  // `month: '2-digit'` con año sale «3/2026» en es-ES: el mes va aparte y con su cero.
  const month = formatDate(joinedAt, { month: 'numeric' }).padStart(2, '0')
  return `${month}/${formatDate(joinedAt, { year: 'numeric' })}`
}

/** «#0042»: el número de carta (orden de registro) con cuatro cifras. */
export const cardNumberLabel = (cardNumber: number) => `#${String(cardNumber).padStart(4, '0')}`
