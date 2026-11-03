import { type AchievementId, achievementById } from '@beatbattle/rules'
import { type SimpleMessageKey, t } from '../../i18n'
import { frameAttributes } from '../Frame'
import { cx } from '../forceState'
import styles from './AchievementBadge.module.css'
import { ACHIEVEMENT_GLYPHS, Glyph } from './glyphs'

/**
 * Insignia de logro (guía §3.8.8, §3.8.10; tarea 7.22): chaflán con el marco de su rareza (común, borde blanco al
 * 32 %; raro, borde rojo; épico, borde holo rojo-blanco-granate; legendario, relleno rojo con trama y borde blanco) y
 * su glifo. Sin conseguir, en silueta; oculta y sin conseguir, «???». Es un dibujo: el nombre accesible lo lleva quien
 * la usa (`achievementLabel`), que sabe si es una casilla de una lista, un hueco de la vitrina…
 */
export function AchievementBadge({
  id,
  unlocked,
  className,
}: {
  id: AchievementId
  unlocked: boolean
  className?: string
}) {
  const { rarity, hidden } = achievementById(id)
  const secret = hidden && !unlocked
  return (
    <span
      {...frameAttributes({ cut: 'md' })}
      className={cx(styles.badge, className)}
      data-rarity={rarity}
      data-locked={unlocked ? undefined : ''}
      data-badge={id}
      aria-hidden="true"
    >
      {secret ? (
        <span className={styles.secret}>{t('ui.achievement.hidden')}</span>
      ) : (
        <Glyph name={ACHIEVEMENT_GLYPHS[id]} className={styles.glyph} />
      )}
    </span>
  )
}

/** Nombre de un logro que se ve: el suyo o, si es oculto y no lo tiene, «Logro oculto». */
export function achievementName(id: AchievementId, unlocked: boolean): string {
  return achievementById(id).hidden && !unlocked
    ? t('ui.achievement.hiddenName')
    : t(`achievement.${id}.name`)
}

/**
 * Lo que se cuenta de un logro (la línea de debajo del nombre): conseguido o visible, su condición; oculto y sin
 * conseguir, su pista críptica (Anexo C).
 */
export function achievementDetail(id: AchievementId, unlocked: boolean): string {
  const { hintKey } = achievementById(id)
  // `hintKey` es `achievement.<id>.hint`, que solo tienen los ocultos (lo comprueba `achievements.test.ts`).
  return hintKey && !unlocked ? t(hintKey as SimpleMessageKey) : t(`achievement.${id}.description`)
}

/**
 * Nombre accesible completo: «Disco de oro, épico» · «Disco de oro, épico, sin conseguir: Gana una semana» · «Logro
 * oculto, raro: La pista no duerme a las cuatro de la mañana».
 */
export function achievementLabel(id: AchievementId, unlocked: boolean): string {
  const rarity = t(`ui.achievement.rarity.${achievementById(id).rarity}`)
  const name = achievementName(id, unlocked)
  return unlocked
    ? t('ui.achievement.label', { name, rarity })
    : t('ui.achievement.lockedLabel', { name, rarity, detail: achievementDetail(id, false) })
}
