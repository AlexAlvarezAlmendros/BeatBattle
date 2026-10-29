import { type AchievementId, achievementById, XP_ACHIEVEMENT_BY_RARITY } from '@beatbattle/rules'
import { formatNumber, t } from '../../i18n'
import { frameAttributes } from '../../ui/Frame'
import { cx } from '../../ui/forceState'
import styles from './AchievementBadge.module.css'

/** La estrella de la insignia (la de las estrellas del voto, `ui/Stars`), en una caja de 100 × 100. */
const STAR = 'M50 18 58.8 36.1 78.5 38.7 64.2 52.6 67.6 72.3 50 63 32.4 72.3 35.8 52.6 21.5 38.7 41.2 36.1Z'

/**
 * La insignia de un logro (§3.8.8): un chaflán con la estrella dentro y el marco de su rareza: común, borde blanco al
 * 32 %; raro, borde rojo; épico, borde holo rojo-blanco-granate; legendario, relleno rojo con trama y borde blanco. Es
 * dibujo: la rareza va en palabra al lado (nunca solo color).
 */
export function AchievementInsignia({ id, className }: { id: AchievementId; className?: string }) {
  const { rarity } = achievementById(id)
  return (
    <span
      {...frameAttributes({ cut: 'md' })}
      className={cx(styles.insignia, className)}
      data-rarity={rarity}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 100" className={styles.star} aria-hidden="true">
        <path d={STAR} />
      </svg>
    </span>
  )
}

/**
 * Un logro en una línea (la bienvenida, «¡JURADO COMPLETO!», la celebración de la subida): la insignia, la rareza, el
 * nombre, la descripción y su XP. `kicker` cambia el rótulo de arriba («Tu primer logro», «Logro desbloqueado»).
 */
export function AchievementBadge({
  id,
  kicker,
  className,
}: {
  id: AchievementId
  kicker?: string
  className?: string
}) {
  const { rarity } = achievementById(id)
  return (
    <div className={cx(styles.badge, className)} data-rarity={rarity} data-achievement={id}>
      <AchievementInsignia id={id} />
      <div className={styles.text}>
        <p className={styles.kicker}>
          {kicker ? `${kicker} · ` : ''}
          <span className={styles.rarity}>{t(`game.rarity.${rarity}`)}</span>
        </p>
        <p className={styles.name}>{t(`achievement.${id}.name`)}</p>
        <p className={styles.desc}>{t(`achievement.${id}.description`)}</p>
      </div>
      <p className={styles.xp}>
        {t('game.notice.xp', { xp: formatNumber(XP_ACHIEVEMENT_BY_RARITY[rarity]) })}
      </p>
    </div>
  )
}
