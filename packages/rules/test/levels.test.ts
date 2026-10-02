import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  LEVEL_CURVE_BASE_XP,
  LEVEL_CURVE_EXPONENT,
  LEVEL_MAX,
  LEVEL_XP_ROUNDING_STEP,
  type RankId,
} from '../src/balance'
import {
  LEVEL_XP_THRESHOLDS,
  levelOf,
  levelProgress,
  rankTitle,
  streakBonus,
  streakBonusPercent,
  xpForLevel,
} from '../src/levels'

// Tabla de niveles del Anexo B, copiada de la guía: nivel, XP acumulado y rango.
const ANNEX_B_LEVELS: readonly [level: number, xp: number, rank: RankId][] = [
  [1, 0, 'crateDigger'], // Excavador de cajones
  [2, 150, 'crateDigger'],
  [3, 450, 'looper'], // Loopero
  [4, 850, 'looper'],
  [5, 1_400, 'sampler'], // Sampleador
  [6, 1_950, 'sampler'],
  [7, 2_650, 'beatmaker'], // Beatmaker
  [8, 3_350, 'beatmaker'],
  [9, 4_200, 'producer'], // Productor
  [10, 5_050, 'producer'],
  [11, 5_950, 'grooveArchitect'], // Arquitecto del groove
  [12, 6_950, 'grooveArchitect'],
  [13, 8_000, 'bounceMaster'], // Maestro del bounce
  [14, 9_100, 'bounceMaster'],
  [15, 10_250, 'studioBoss'], // Jefe de estudio
  [16, 11_400, 'studioBoss'],
  [17, 12_650, 'blockLegend'], // Leyenda del barrio
  [18, 13_950, 'blockLegend'],
  [19, 15_300, 'blockLegend'],
  [20, 16_700, 'otherPeople'], // Other People
]

const level = fc.integer({ min: 1, max: LEVEL_MAX })
const xp = fc.double({ min: 0, max: 100_000, noNaN: true })

describe('niveles', () => {
  it('RF-GAME-02: la fórmula del Anexo G reproduce la tabla del Anexo B', () => {
    expect(ANNEX_B_LEVELS).toHaveLength(LEVEL_MAX)
    for (const [n, expectedXp] of ANNEX_B_LEVELS) expect(xpForLevel(n), `nivel ${n}`).toBe(expectedXp)
    expect(LEVEL_XP_THRESHOLDS).toEqual(ANNEX_B_LEVELS.map(([, x]) => x))
  })

  it('RF-GAME-02: nivel y rango en las fronteras de la tabla', () => {
    for (const [n, threshold, rank] of ANNEX_B_LEVELS) {
      expect(levelOf(threshold), `xp ${threshold}`).toBe(n)
      expect(rankTitle(n), `nivel ${n}`).toBe(rank)
      if (n > 1) expect(levelOf(threshold - 1), `xp ${threshold - 1}`).toBe(n - 1)
      if (n > 1) expect(levelOf(threshold - 0.001)).toBe(n - 1)
    }
    expect(levelOf(1_000_000)).toBe(LEVEL_MAX)
  })

  it('ningún umbral está cerca de un empate de redondeo (la tabla no depende del motor)', () => {
    for (let n = 1; n <= LEVEL_MAX; n++) {
      const steps = (LEVEL_CURVE_BASE_XP * (n - 1) ** LEVEL_CURVE_EXPONENT) / LEVEL_XP_ROUNDING_STEP
      const distanceToTie = Math.abs((steps % 1) - 0.5)
      expect(distanceToTie, `nivel ${n}`).toBeGreaterThan(0.001)
    }
  })

  it('levelOf(xpForLevel(n)) === n', () => {
    fc.assert(
      fc.property(level, (n) => {
        expect(levelOf(xpForLevel(n))).toBe(n)
      }),
    )
  })

  it('el nivel de un XP es el mayor cuyo umbral no lo supera', () => {
    fc.assert(
      fc.property(xp, (total) => {
        const n = levelOf(total)
        expect(n).toBeGreaterThanOrEqual(1)
        expect(n).toBeLessThanOrEqual(LEVEL_MAX)
        expect(xpForLevel(n)).toBeLessThanOrEqual(total)
        if (n < LEVEL_MAX) expect(xpForLevel(n + 1)).toBeGreaterThan(total)
      }),
    )
  })

  it('más XP nunca baja de nivel', () => {
    fc.assert(
      fc.property(xp, xp, (a, b) => {
        expect(levelOf(Math.max(a, b))).toBeGreaterThanOrEqual(levelOf(Math.min(a, b)))
      }),
    )
  })

  it('progreso dentro del nivel para la barra de XP', () => {
    expect(levelProgress(0)).toEqual({ level: 1, levelXp: 0, nextLevelXp: 150, fraction: 0 })
    expect(levelProgress(300)).toEqual({ level: 2, levelXp: 150, nextLevelXp: 450, fraction: 0.5 })
    expect(levelProgress(16_700)).toEqual({ level: 20, levelXp: 16_700, nextLevelXp: null, fraction: 1 })
    fc.assert(
      fc.property(xp, (total) => {
        const { fraction, level: n } = levelProgress(total)
        expect(fraction).toBeGreaterThanOrEqual(0)
        expect(n === LEVEL_MAX ? fraction === 1 : fraction < 1).toBe(true)
      }),
    )
  })

  it('rechaza niveles y XP imposibles', () => {
    expect(() => xpForLevel(0)).toThrow(RangeError)
    expect(() => xpForLevel(21)).toThrow(RangeError)
    expect(() => xpForLevel(2.5)).toThrow(RangeError)
    expect(() => rankTitle(0)).toThrow(RangeError)
    expect(() => levelOf(-1)).toThrow(RangeError)
    expect(() => levelOf(Number.NaN)).toThrow(RangeError)
    expect(() => levelOf(Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })
})

describe('bonus de racha', () => {
  it('RF-GAME-04 (parcial: bonus; la racha con comodín llega en la Fase 7): bonus = min(0,5, 0,1 · (racha − 1)) para racha ≥ 2 (Anexo G)', () => {
    const expected: [streak: number, bonus: number][] = [
      [0, 0],
      [1, 0],
      [2, 0.1],
      [3, 0.2],
      [4, 0.3],
      [5, 0.4],
      [6, 0.5],
      [7, 0.5],
      [52, 0.5],
    ]
    for (const [streak, bonus] of expected) expect(streakBonus(streak), `racha ${streak}`).toBe(bonus)
  })

  it('en puntos porcentuales enteros, para cuentas de XP exactas', () => {
    expect([0, 1, 2, 3, 6, 10].map(streakBonusPercent)).toEqual([0, 0, 10, 20, 50, 50])
    // 100 XP con racha de 4 semanas: 100 · (100 + 30) / 100 = 130 exactos.
    expect((100 * (100 + streakBonusPercent(4))) / 100).toBe(130)
  })

  it('está entre 0 y 0,5 y no baja al alargar la racha', () => {
    fc.assert(
      fc.property(fc.nat(1_000), fc.nat(100), (streak, more) => {
        const bonus = streakBonus(streak)
        expect(bonus).toBeGreaterThanOrEqual(0)
        expect(bonus).toBeLessThanOrEqual(0.5)
        expect(streakBonus(streak + more)).toBeGreaterThanOrEqual(bonus)
      }),
    )
  })

  it('rechaza rachas imposibles', () => {
    expect(() => streakBonus(-1)).toThrow(RangeError)
    expect(() => streakBonus(1.5)).toThrow(RangeError)
  })
})
