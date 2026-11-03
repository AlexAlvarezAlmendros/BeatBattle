import { ACHIEVEMENTS } from '@beatbattle/rules'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { t } from '../../i18n'
import { AchievementBadge, achievementDetail, achievementLabel, achievementName } from './AchievementBadge'
import { ACHIEVEMENT_GLYPHS } from './glyphs'

describe('insignias de logro (§3.8.8, §3.8.10, Anexo C)', () => {
  it('RF-GAME-05: cada logro del catálogo tiene nombre, condición y glifo; solo los ocultos llevan pista', () => {
    for (const { id, hidden, hintKey } of ACHIEVEMENTS) {
      expect(t.has(`achievement.${id}.name`), id).toBe(true)
      expect(t.has(`achievement.${id}.description`), id).toBe(true)
      expect(ACHIEVEMENT_GLYPHS[id], id).toBeTruthy()
      expect(t.has(`achievement.${id}.hint`), id).toBe(hidden)
      if (hintKey) expect(hintKey).toBe(`achievement.${id}.hint`)
    }
  })

  it('RF-GAME-05: un oculto sin conseguir es «???» con su pista; conseguido, su nombre y su condición', () => {
    expect(achievementName('night_owl', false)).toBe(t('ui.achievement.hiddenName'))
    expect(achievementDetail('night_owl', false)).toBe(t('achievement.night_owl.hint'))
    expect(achievementName('night_owl', true)).toBe('Búho')
    expect(achievementDetail('night_owl', true)).toBe(t('achievement.night_owl.description'))
    const { container } = render(<AchievementBadge id="night_owl" unlocked={false} />)
    expect(container).toHaveTextContent('???')
    expect(container.querySelector('svg')).toBeNull()
  })

  it('§3.8.10: cada insignia tiene su nombre accesible, con la rareza y, si falta, cómo se gana', () => {
    expect(achievementLabel('win', true)).toBe('Disco de oro, épico')
    expect(achievementLabel('win', false)).toBe(
      `Disco de oro, épico, sin conseguir: ${t('achievement.win.description')}`,
    )
    expect(achievementLabel('oracle', false)).toBe(
      `Logro oculto, legendario, sin conseguir: ${t('achievement.oracle.hint')}`,
    )
  })

  it('§3.8.8: el marco es el de su rareza; sin conseguir, en silueta', () => {
    const { container, rerender } = render(<AchievementBadge id="season_champ" unlocked />)
    const badge = container.firstElementChild as HTMLElement
    expect(badge).toHaveAttribute('data-rarity', 'legendary')
    expect(badge).not.toHaveAttribute('data-locked')
    expect(badge).toHaveAttribute('aria-hidden', 'true')
    rerender(<AchievementBadge id="season_champ" unlocked={false} />)
    expect(container.firstElementChild).toHaveAttribute('data-locked')
  })
})
