import { RANK_LADDER, rankTitle } from '@beatbattle/rules'
import { describe, expect, it } from 'vitest'
import { t } from './index'

// Títulos de rango del Anexo B: `rankTitle` devuelve un id y el texto sale de i18n (guía v0.4, §4.5).
const ANNEX_B_TITLES = {
  1: 'Excavador de cajones',
  3: 'Loopero',
  5: 'Sampleador',
  7: 'Beatmaker',
  9: 'Productor',
  11: 'Arquitecto del groove',
  13: 'Maestro del bounce',
  15: 'Jefe de estudio',
  17: 'Leyenda del barrio',
  20: 'Other People',
} as const

describe('títulos de rango', () => {
  it('RF-GAME-02: cada rango de la escalera tiene su texto en es.json', () => {
    for (const step of RANK_LADDER) expect(t.has(`rank.${step.id}`)).toBe(true)
  })

  it('RF-GAME-02: el texto de cada rango coincide con el Anexo B', () => {
    for (const [level, title] of Object.entries(ANNEX_B_TITLES))
      expect(t(`rank.${rankTitle(Number(level))}`)).toBe(title)
  })
})
