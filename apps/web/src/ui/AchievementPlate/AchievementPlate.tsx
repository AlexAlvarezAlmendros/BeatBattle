import { type AchievementId, achievementById, XP_ACHIEVEMENT_BY_RARITY } from '@beatbattle/rules'
import { formatNumber, t } from '../../i18n'
import { AchievementBadge } from '../AchievementBadge'
import { cx } from '../forceState'
import styles from './AchievementPlate.module.css'

/**
 * Placa de logro (guía §3.8.8; tareas 7.20 y 7.21): un logro en una línea, con su insignia (`AchievementBadge`, la misma
 * de la rejilla del perfil y la vitrina de la carta: el marco de su rareza y su glifo), la rareza en palabra (nunca solo
 * color), el nombre, la descripción del Anexo C y su XP. La de los avisos de logro (y el legendario al centro), la de
 * «¡JURADO COMPLETO!» y la del primer logro de la bienvenida: siempre un logro a la vista (ganado, o el que toca ganar),
 * nunca en silueta. `kicker` cambia el rótulo de arriba («Logro desbloqueado»).
 */
export function AchievementPlate({
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
    <div className={cx(styles.plate, className)} data-rarity={rarity} data-achievement={id}>
      <AchievementBadge id={id} unlocked className={styles.insignia} />
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
