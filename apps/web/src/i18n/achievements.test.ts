import { ACHIEVEMENTS } from '@beatbattle/rules'
import { describe, expect, it } from 'vitest'
import es from './es.json'
import { t } from './index'

/**
 * Los textos de los 36 logros del Anexo C (tareas 7.20 y 7.24): el aviso de logro (§3.8.8), la bienvenida (§3.8.9)
 * y el perfil los pintan con el catálogo de `@beatbattle/rules` y estas claves.
 */
describe('textos de los logros', () => {
  it('RF-GAME-05: cada logro del catálogo tiene nombre y descripción; los ocultos, además, su pista (`hintKey`)', () => {
    for (const achievement of ACHIEVEMENTS) {
      expect(t(`achievement.${achievement.id}.name`).trim(), achievement.id).not.toBe('')
      expect(t(`achievement.${achievement.id}.desc`).trim(), achievement.id).not.toBe('')
      if (achievement.hintKey) expect(t.has(achievement.hintKey), achievement.hintKey).toBe(true)
    }
  })

  it('RF-GAME-05: no hay textos de logros fuera del catálogo, ni pistas de logros que se ven', () => {
    const catalog = new Map(ACHIEVEMENTS.map((achievement) => [achievement.id as string, achievement]))
    for (const [id, texts] of Object.entries(es.achievement)) {
      const achievement = catalog.get(id)
      expect(achievement, id).toBeDefined()
      expect('hint' in texts, id).toBe(Boolean(achievement?.hidden))
    }
  })

  it('RF-GAME-05: los nombres son los del Anexo C', () => {
    expect(t('achievement.first_drop.name')).toBe('Primer sample')
    expect(t('achievement.jury_full.name')).toBe('Jurado completo')
    expect(t('achievement.season_champ.name')).toBe('Campeón de temporada')
    expect(t('achievement.revetlla.name')).toBe('Revetlla')
  })
})
