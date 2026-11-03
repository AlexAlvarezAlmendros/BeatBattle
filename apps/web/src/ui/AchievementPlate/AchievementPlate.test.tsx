import { ACHIEVEMENTS, XP_ACHIEVEMENT_BY_RARITY } from '@beatbattle/rules'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { formatNumber, t } from '../../i18n'
import { AchievementPlate } from './AchievementPlate'

/** Testing Library normaliza los espacios del nodo (también el de no separación), no los del texto buscado. */
const plain = (text: string) => text.replace(/\s+/g, ' ')

describe('placa de logro (§3.8.8; tareas 7.20 y 7.21)', () => {
  it('RNF-A11Y-05: la rareza también en palabra (nunca solo color), el nombre, la descripción y el XP de cada logro', () => {
    for (const { id, rarity } of ACHIEVEMENTS) {
      const { container, unmount } = render(<AchievementPlate id={id} kicker={t('game.notice.unlocked')} />)
      const plate = container.firstElementChild
      expect(plate, id).toHaveAttribute('data-achievement', id)
      expect(plate, id).toHaveAttribute('data-rarity', rarity)
      expect(screen.getByText(t(`game.rarity.${rarity}`)), id).toBeInTheDocument()
      expect(screen.getByText(plain(t(`achievement.${id}.name`))), id).toBeInTheDocument()
      expect(screen.getByText(plain(t(`achievement.${id}.description`))), id).toBeInTheDocument()
      expect(
        screen.getByText(plain(t('game.notice.xp', { xp: formatNumber(XP_ACHIEVEMENT_BY_RARITY[rarity]) }))),
        id,
      ).toBeInTheDocument()
      // La insignia es la del logro (la del perfil y la vitrina), a la vista y con su glifo; es dibujo: fuera del árbol
      // accesible.
      const badge = plate?.querySelector(`[data-badge="${id}"]`)
      expect(badge, id).toHaveAttribute('aria-hidden', 'true')
      expect(badge, id).toHaveAttribute('data-rarity', rarity)
      expect(badge, id).not.toHaveAttribute('data-locked')
      expect(badge?.querySelector('svg'), id).not.toBeNull()
      unmount()
    }
  })

  it('§3.8.9: sin rótulo, solo la rareza (la bienvenida pone el suyo encima)', () => {
    render(<AchievementPlate id="first_drop" />)
    expect(screen.queryByText(new RegExp(t('game.notice.unlocked')))).toBeNull()
    expect(screen.getByText(t('game.rarity.common'))).toBeInTheDocument()
  })
})
