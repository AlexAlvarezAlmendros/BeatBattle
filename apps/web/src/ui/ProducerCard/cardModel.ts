import {
  type AchievementId,
  type CardVariant,
  cardVariant,
  levelProgress,
  rankTitle,
  unlockedVariants,
} from '@beatbattle/rules'
import { type AchievementUnlock, initialsOf, type ProfileGame, type PublicProfile } from '@beatbattle/shared'
import { formatDate, t } from '../../i18n'

/**
 * Lo que la carta de productor dice de su dueño (guía §3.4.4, §2.10; tarea 7.22), sacado de lo público del perfil
 * (`GET /api/profiles/:username`, solo semanas selladas: hueco G1). Puro: es el único modelo de la carta, y lo pintan
 * la carta plana (`ProducerCard`, también en la vista previa de Ajustes → Perfil) y el lienzo 2D por CPU
 * (`cardCanvas`: la tarjeta para *stories* de la 7.28 y, con la 7.23, la textura de la carta 3D).
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

/**
 * El anverso de la carta, ya en palabras y cifras: lo mismo para la carta HTML (`ProducerCard`), el lienzo por CPU
 * (`paintCardFace`) y la textura de la 3D.
 */
export interface CardFront {
  name: string
  initials: string
  cardNumber: number
  level: number
  /** Fracción del nivel en curso, `[0, 1]` (el arco del sello). */
  levelFraction: number
  /** El rango, ya en palabras («Beatmaker»). */
  rank: string
  stats: { wins: number; podiums: number; weeks: number }
  /** Hasta tres logros de la vitrina (conseguidos); los huecos van en silueta. */
  showcase: readonly AchievementId[]
  /** Logros conseguidos que enseña el perfil: «Vitrina · 3 de 14». Sin el dato, solo «Vitrina». */
  achievements?: number
  /** «03/2026»: mes y año de alta. */
  since: string
  /** Variante (§3.4.4): estándar, roja, holo o de campeón. */
  variant: CardVariant
}

/**
 * El reverso de la carta (§3.4.4): el número, el logo, el QR del perfil con su dirección escrita debajo y la fecha de
 * alta, con el marco de su variante. Lo pinta la carta HTML (con `back`) y, con la 7.23, el lienzo por CPU de la cara de
 * atrás de la 3D (`paintCardBack`).
 */
export interface CardBack extends Pick<CardFront, 'cardNumber' | 'since' | 'variant'> {
  /** La dirección del perfil, entera (se escribe sin el protocolo). */
  profileUrl: string
}

/** El reverso de un anverso, con la dirección de su perfil. */
export const cardBack = (front: CardFront, profileUrl: string): CardBack => ({
  cardNumber: front.cardNumber,
  since: front.since,
  variant: front.variant,
  profileUrl,
})

/**
 * La carta de un perfil público (de su capa de juego: solo semanas selladas, hueco G1), con la variante más alta que
 * tiene ganada, las que puede enseñar y la foto del avatar (sin ella, el monograma).
 */
export function profileCard(
  profile: PublicProfile,
): CardFront & { avatarUrl: string | null; unlocked: CardVariant[] } {
  const progress = levelProgress(profile.xp)
  const stats = cardStats(profile.game.history)
  const facts = { level: progress.level, wins: stats.wins, champion: isChampion(profile.game.achievements) }
  return {
    name: profile.displayUsername,
    initials: initialsOf(profile.displayUsername),
    cardNumber: profile.cardNumber,
    level: progress.level,
    levelFraction: progress.fraction,
    rank: t(`rank.${rankTitle(progress.level)}`),
    stats,
    showcase: profile.game.showcase,
    achievements: profile.game.achievements.length,
    since: cardSince(profile.joinedAt),
    avatarUrl: profile.avatarUrl,
    variant: cardVariant(facts),
    unlocked: unlockedVariants(facts),
  }
}
