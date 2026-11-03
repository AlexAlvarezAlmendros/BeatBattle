import type { ProfileHistoryRow } from '@beatbattle/shared'
import { describe, expect, it } from 'vitest'
import {
  cardNumberLabel,
  cardSince,
  cardStats,
  cardVariant,
  isChampion,
  RED_CARD_LEVEL,
  unlockedVariants,
} from './cardModel'

const row = (weekNumber: number, position: number | null): ProfileHistoryRow => ({
  weekSlug: `2026-w${String(weekNumber).padStart(2, '0')}`,
  weekNumber,
  entryId: `e-${weekNumber}`,
  alias: 'Faro Errante',
  title: 'Neón en Sants',
  cover: { kind: 'generative', seed: weekNumber },
  votes: 30,
  position,
  scoreMilli: 4000,
})

describe('carta de productor: lo que dice de su dueño (§3.4.4)', () => {
  it('§3.4.4: la carta roja llega con el rango Productor (nivel 9, Anexo B)', () => {
    expect(RED_CARD_LEVEL).toBe(9)
    expect(cardVariant({ level: 8, wins: 0, champion: false })).toBe('standard')
    expect(cardVariant({ level: 9, wins: 0, champion: false })).toBe('red')
  })

  it('§3.4.4 / egg.holo: ganar una semana da la holo, y ser campeón de temporada, la de campeón (la más alta manda)', () => {
    expect(cardVariant({ level: 2, wins: 1, champion: false })).toBe('holo')
    expect(cardVariant({ level: 2, wins: 1, champion: true })).toBe('champion')
    expect(unlockedVariants({ level: 12, wins: 3, champion: false })).toEqual(['standard', 'red', 'holo'])
    expect(unlockedVariants({ level: 1, wins: 0, champion: true })).toEqual(['standard', 'champion'])
  })

  it('§3.4.4: victorias · podios · semanas salen del historial sellado (ex aequo incluidos; sin clasificar cuenta como semana)', () => {
    expect(cardStats([row(40, 1), row(39, 1), row(38, 3), row(37, 7), row(36, null)])).toEqual({
      wins: 2,
      podiums: 3,
      weeks: 5,
    })
    expect(cardStats([])).toEqual({ wins: 0, podiums: 0, weeks: 0 })
  })

  it('§3.4.4: campeón es tener `season_champ` entre los logros públicos', () => {
    expect(isChampion([{ id: 'season_champ', unlockedAt: 1 }])).toBe(true)
    expect(isChampion([{ id: 'win', unlockedAt: 1 }])).toBe(false)
  })

  it('§3.4.4: «#0042» y «DESDE 03/2026», en hora de Madrid', () => {
    expect(cardNumberLabel(42)).toBe('#0042')
    expect(cardSince(Date.UTC(2026, 2, 10))).toBe('03/2026')
    // El 31 de diciembre a las 23:30 UTC ya es enero en Madrid.
    expect(cardSince(Date.UTC(2026, 11, 31, 23, 30))).toBe('01/2027')
  })
})
