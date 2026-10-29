import type { AchievementUnlock, ProfileGame } from '@beatbattle/shared'
import { formatDate } from '../../i18n'

/**
 * Lo que la carta de productor dice de su dueño (guía §3.4.4, §2.10; tarea 7.22), sacado de lo público del perfil
 * (`GET /api/profiles/:username`, solo semanas selladas: hueco G1). Puro: lo usan la carta plana, la vista previa de
 * Ajustes → Perfil, el lienzo 2D de la carta (`cardCanvas`: la tarjeta para *stories* de la 7.28 y, con la 7.23, la
 * textura 3D).
 */

/**
 * Las variantes (estándar, roja, holo y campeón) son una regla del juego que comparte la imagen OG del perfil: viven en
 * `@beatbattle/rules` (`card`, tarea 7.28) y aquí se reexportan.
 */
export {
  CARD_VARIANTS,
  type CardFacts,
  type CardVariant,
  cardVariant,
  RED_CARD_LEVEL,
  unlockedVariants,
} from '@beatbattle/rules'

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
