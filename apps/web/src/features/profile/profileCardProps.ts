import { levelProgress, rankTitle } from '@beatbattle/rules'
import type { PublicProfile } from '@beatbattle/shared'
import { t } from '../../i18n'
import { cardSince, cardStats, cardVariant, isChampion, unlockedVariants } from '../../ui/ProducerCard'
import { initialsOf } from '../account/session'

/**
 * Lo que la carta de un perfil público necesita, sacado de su capa de juego (solo semanas selladas, hueco G1): la del
 * perfil, la de Ajustes → Perfil y la de la ceremonia del campeón de temporada (§3.8.15). Sin la pieza del perfil (ni
 * sus estilos): la ceremonia la importa en su trozo.
 */
export function profileCardProps(profile: PublicProfile) {
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
