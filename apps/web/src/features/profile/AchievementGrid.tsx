import { ACHIEVEMENTS, type AchievementId, achievementById } from '@beatbattle/rules'
import type { AchievementUnlock } from '@beatbattle/shared'
import { useEffect, useMemo, useRef, useState } from 'react'
import { formatDate, t } from '../../i18n'
import {
  AchievementBadge,
  achievementDetail,
  achievementLabel,
  achievementName,
} from '../../ui/AchievementBadge'
import { Button } from '../../ui/Button'
import { useMediaQuery } from '../../ui/hooks/useMediaQuery'
import { useRovingGrid } from '../../ui/hooks/useRovingGrid'
import { singleKeyAllowed, useShortcuts } from '../../ui/shortcuts'
import styles from './ProfilePage.module.css'

/** Insignias a la vista antes de «Ver los 36 logros»: dos filas de seis, como `05-perfil`. */
export const ACHIEVEMENTS_COLLAPSED = 12

export interface AchievementSlot {
  id: AchievementId
  unlockedAt: number | null
}

/**
 * Los 36 logros del Anexo C en el orden de la rejilla: primero los conseguidos (por el catálogo), después los que
 * faltan y se ven, y al final los ocultos que faltan («???»).
 */
export function achievementSlots(unlocks: readonly AchievementUnlock[]): AchievementSlot[] {
  const at = new Map(unlocks.map((unlock) => [unlock.id, unlock.unlockedAt]))
  const rank = (id: AchievementId, hidden: boolean) => (at.has(id) ? 0 : hidden ? 2 : 1)
  return ACHIEVEMENTS.map((a, index) => ({ a, index }))
    .sort((p, q) => rank(p.a.id, p.a.hidden) - rank(q.a.id, q.a.hidden) || p.index - q.index)
    .map(({ a }) => ({ id: a.id, unlockedAt: at.get(a.id) ?? null }))
}

/**
 * Los logros del perfil (§3.8.10, Anexo C; tarea 7.24): la rejilla de insignias, que se recorre como un menú de juego
 * (el foco es el cursor; flechas, Inicio y Fin) con la ficha de la elegida debajo: nombre, rareza y su condición o, si
 * es un oculto que falta, su pista. Los que faltan van en silueta y los ocultos, «???». Solo cuenta lo público (semanas
 * selladas, hueco G1). «Ver los 36 logros» (L) despliega la rejilla entera.
 */
export function AchievementGrid({ unlocks }: { unlocks: readonly AchievementUnlock[] }) {
  const slots = useMemo(() => achievementSlots(unlocks), [unlocks])
  const [all, setAll] = useState(false)
  const shown = all ? slots : slots.slice(0, ACHIEVEMENTS_COLLAPSED)
  const narrow = useMediaQuery('(max-width: 720px)')
  const [active, setActive] = useState(0)
  const grid = useRovingGrid({ count: shown.length, columns: narrow ? 4 : 6, onMove: setActive })
  const sectionRef = useRef<HTMLElement>(null)
  const shortcuts = useShortcuts((state) => state.enabled)
  const slot = shown[Math.min(active, shown.length - 1)]
  const toggle = () => setAll((value) => !value)

  // L despliega o recoge la rejilla (la tecla que enseña su botón), como C gira la carta.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `toggle` solo cambia el estado
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) return
      if (event.key.toLowerCase() !== 'l') return
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (!singleKeyAllowed(Boolean(target && sectionRef.current?.contains(target)))) return
      event.preventDefault()
      toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcuts])

  return (
    <section ref={sectionRef} className={styles.section} aria-labelledby="profile-achievements">
      <div className={styles.sectionHead}>
        <h2 id="profile-achievements" className={styles.sectionTitle}>
          {t('pages.profile.achievements.title')}
        </h2>
        <span className="bb-label">
          {t('pages.profile.achievements.count', { unlocked: unlocks.length, total: slots.length })}
        </span>
      </div>
      <ul
        {...grid.getContainerProps({ 'aria-labelledby': 'profile-achievements' })}
        className={styles.achievements}
      >
        {shown.map((item, index) => {
          const unlocked = item.unlockedAt !== null
          return (
            <li key={item.id} {...grid.getItemProps(index)} aria-label={achievementLabel(item.id, unlocked)}>
              <AchievementBadge id={item.id} unlocked={unlocked} className={styles.achievementBadge} />
            </li>
          )
        })}
      </ul>
      {slot && (
        <div className={styles.achievementCard}>
          <p className={styles.achievementName}>
            {achievementName(slot.id, slot.unlockedAt !== null)}
            <span className={styles.achievementRarity}>
              {' · '}
              {t(`ui.achievement.rarity.${achievementById(slot.id).rarity}`)}
            </span>
          </p>
          <p className={styles.achievementDetail}>{achievementDetail(slot.id, slot.unlockedAt !== null)}</p>
          <p className={styles.achievementWhen}>
            {slot.unlockedAt === null
              ? t('pages.profile.achievements.locked')
              : t('pages.profile.achievements.unlockedOn', { date: formatDate(slot.unlockedAt) })}
          </p>
        </div>
      )}
      <Button
        variant="outline"
        size="sm"
        keyHint={t('frame.keys.glyph.l')}
        aria-expanded={all}
        className={styles.more}
        onClick={toggle}
      >
        {all
          ? t('pages.profile.achievements.less')
          : t('pages.profile.achievements.more', { total: slots.length })}
      </Button>
    </section>
  )
}
