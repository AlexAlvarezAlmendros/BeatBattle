// La tabla de equilibrado (Anexo B) copiada aquí a mano: si alguien cambia un número en balance.ts
// sin cambiar la guía, este test lo delata (guía §0: la guía manda).

import { describe, expect, it } from 'vitest'
import * as balance from '../src/balance'

describe('balance: semana y voto (Anexo B)', () => {
  it('cierres de la semana como horas de pared en Madrid', () => {
    expect(balance.WEEK_TIME_ZONE).toBe('Europe/Madrid')
    expect(balance.WEEK_OPENS_AT).toEqual({ isoWeekday: 1, hour: 0, minute: 0, second: 0 })
    expect(balance.SUBMISSIONS_CLOSE_AT).toEqual({ isoWeekday: 7, hour: 20, minute: 0, second: 0 })
    expect(balance.VOTING_CLOSE_EXCLUSIVE_AT).toEqual({
      isoWeekday: 1,
      hour: 0,
      minute: 0,
      second: 0,
      weekOffset: 1,
    })
    expect(balance.VOTING_CLOSE_DISPLAY_AT).toEqual({ isoWeekday: 7, hour: 23, minute: 59, second: 59 })
  })

  // Anexo B: el cierre de votos se guarda como el instante exclusivo del lunes 00:00:00.000, así la
  // ventana de solo votación dura 4 h justas (§2.1, «al menos 4 h»). En una semana sin cambio de
  // hora el tiempo de pared y el real coinciden, así que la cuenta con horas de pared basta.
  it('RF-DROP-01: el cierre de votos es el lunes 00:00 exclusivo, 4 h justas tras el cierre de envíos', () => {
    const HOUR_MS = 3_600_000
    const DAY_MS = 24 * HOUR_MS
    const offsetMs = (at: balance.WeeklyWallTime & { readonly weekOffset?: number }) =>
      ((at.weekOffset ?? 0) * 7 + at.isoWeekday - 1) * DAY_MS +
      at.hour * HOUR_MS +
      at.minute * 60_000 +
      at.second * 1_000

    expect(offsetMs(balance.VOTING_CLOSE_EXCLUSIVE_AT) - offsetMs(balance.SUBMISSIONS_CLOSE_AT)).toBe(
      14_400_000,
    )
    // Es la apertura de la semana siguiente: no queda ningún instante entre una semana y otra.
    expect(offsetMs(balance.VOTING_CLOSE_EXCLUSIVE_AT)).toBe(offsetMs(balance.WEEK_OPENS_AT) + 7 * DAY_MS)
    // La hora que se muestra es el último segundo antes de la frontera.
    expect(offsetMs(balance.VOTING_CLOSE_EXCLUSIVE_AT) - offsetMs(balance.VOTING_CLOSE_DISPLAY_AT)).toBe(
      1_000,
    )
  })

  it('constantes de voto', () => {
    expect(balance.STARS_MIN).toBe(1)
    expect(balance.STARS_MAX).toBe(5)
    expect(balance.LISTEN_THRESHOLD_MAX_MS).toBe(45_000)
    expect(balance.LISTEN_THRESHOLD_DURATION_PERCENT).toBe(50)
    expect(balance.BAYES_PRIOR_WEIGHT).toBe(5)
    expect(balance.PODIUM_MIN_VOTES).toBe(3)
    expect(balance.PODIUM_SIZE).toBe(3)
    expect(balance.TOP_TEN_LAST_POSITION).toBe(10)
    expect(balance.VOTES_PER_HOUR_LIMIT).toBe(120)
  })

  it('constantes de entradas y audio', () => {
    expect(balance.ENTRY_MIN_DURATION_MS).toBe(30_000)
    expect(balance.ENTRY_MAX_DURATION_MS).toBe(6 * 60_000)
    expect(balance.ENTRY_MAX_BYTES).toBe(104_857_600)
    expect(balance.TARGET_LOUDNESS_LUFS).toBe(-14)
    expect(balance.PLAYBACK_GAIN_MAX_DB).toBe(0)
    expect(balance.STREAM_BITRATE_KBPS).toBe(192)
    expect(balance.ORIGINAL_RETENTION_WEEKS).toBe(8)
    expect(balance.ORIGINAL_RETENTION_EXEMPT_TOP_POSITIONS).toBe(3)
    expect(balance.PLAY_COUNT_MIN_CONTINUOUS_MS).toBe(10_000)
  })
})

describe('balance: XP (Anexo B)', () => {
  it('tabla de XP por evento', () => {
    expect(balance.XP_ENTRY_SUBMITTED).toBe(100)
    expect(balance.XP_FIRST_ENTRY_OF_WEEK).toBe(25)
    expect(balance.XP_VOTE).toBe(5)
    expect(balance.XP_VOTE_MAX_VOTES_PER_WEEK).toBe(40)
    expect(balance.XP_JURY_COMPLETE).toBe(50)
    expect(balance.JURY_COMPLETE_MIN_ENTRIES).toBe(5)
    expect(balance.XP_QUALIFIED).toBe(25)
    expect(balance.XP_PODIUM_BY_POSITION).toEqual([500, 350, 250])
    expect(balance.XP_TOP_TEN).toBe(100)
    expect(balance.XP_GOLDEN_EAR).toBe(75)
    expect(balance.XP_PRODUCER_GUESS).toBe(15)
    expect(balance.XP_PRODUCER_GUESS_MAX_PER_WEEK).toBe(5)
    expect(balance.XP_ACHIEVEMENT_BY_RARITY).toEqual({ common: 25, rare: 75, epic: 150, legendary: 300 })
    expect(balance.GOLDEN_WEEK_XP_MULTIPLIER).toBe(2)
  })

  it('racha y oído de oro', () => {
    expect(balance.STREAK_BONUS_FROM_WEEK).toBe(2)
    expect(balance.STREAK_BONUS_STEP_PERCENT).toBe(10)
    expect(balance.STREAK_BONUS_MAX_PERCENT).toBe(50)
    expect(balance.STREAK_JOKERS_PER_SEASON).toBe(1)
    expect(balance.GOLDEN_EAR_MIN_VOTES).toBe(8)
    expect(balance.GOLDEN_EAR_MIN_RHO).toBe(0.6)
  })

  it('el XP de resultado crece con la posición y el de logro con la rareza', () => {
    expect(balance.XP_PODIUM_BY_POSITION).toHaveLength(balance.PODIUM_SIZE)
    const results = [...balance.XP_PODIUM_BY_POSITION, balance.XP_TOP_TEN, balance.XP_QUALIFIED]
    for (let i = 1; i < results.length; i++) expect(results[i]).toBeLessThan(results[i - 1] as number)
    const byRarity = balance.ACHIEVEMENT_RARITIES.map((r) => balance.XP_ACHIEVEMENT_BY_RARITY[r])
    for (let i = 1; i < byRarity.length; i++) expect(byRarity[i]).toBeGreaterThan(byRarity[i - 1] as number)
  })
})

describe('balance: niveles, rangos y temporadas (Anexo B)', () => {
  it('curva de niveles', () => {
    expect(balance.LEVEL_MIN).toBe(1)
    expect(balance.LEVEL_MAX).toBe(20)
    expect(balance.LEVEL_CURVE_BASE_XP).toBe(150)
    expect(balance.LEVEL_CURVE_EXPONENT).toBe(1.6)
    expect(balance.LEVEL_XP_ROUNDING_STEP).toBe(50)
  })

  it('la escalera de rangos empieza en el nivel 1, sube y acaba en «Other People» en el 20', () => {
    const ladder = balance.RANK_LADDER
    expect(ladder[0]?.fromLevel).toBe(balance.LEVEL_MIN)
    expect(ladder.at(-1)).toEqual({ fromLevel: balance.LEVEL_MAX, id: 'otherPeople' })
    for (let i = 1; i < ladder.length; i++) {
      expect(ladder[i]?.fromLevel).toBeGreaterThan(ladder[i - 1]?.fromLevel as number)
    }
    expect(new Set(ladder.map((step) => step.id)).size).toBe(ladder.length)
  })

  it('puntos de temporada', () => {
    expect(balance.SEASON_POINTS_BY_POSITION).toEqual([25, 18, 15, 12, 10, 8, 6, 4, 2, 1])
    expect(balance.SEASON_POINTS_BY_POSITION).toHaveLength(balance.TOP_TEN_LAST_POSITION)
    expect(balance.SEASON_POINTS_QUALIFIED_OUTSIDE_TOP).toBe(1)
  })
})

describe('balance: inmutabilidad', () => {
  it('todas las tablas y horas están congeladas, también por dentro', () => {
    const frozen = [
      balance.WEEK_OPENS_AT,
      balance.SUBMISSIONS_CLOSE_AT,
      balance.VOTING_CLOSE_EXCLUSIVE_AT,
      balance.VOTING_CLOSE_DISPLAY_AT,
      balance.XP_PODIUM_BY_POSITION,
      balance.ACHIEVEMENT_RARITIES,
      balance.XP_ACHIEVEMENT_BY_RARITY,
      balance.RANK_LADDER,
      ...balance.RANK_LADDER,
      balance.SEASON_POINTS_BY_POSITION,
    ]
    for (const value of frozen) expect(Object.isFrozen(value)).toBe(true)
  })

  it('mutarlas en ejecución falla', () => {
    expect(() => {
      ;(balance.SEASON_POINTS_BY_POSITION as unknown as number[])[0] = 99
    }).toThrow(TypeError)
    expect(() => {
      ;(balance.VOTING_CLOSE_EXCLUSIVE_AT as { hour: number }).hour = 22
    }).toThrow(TypeError)
    expect(balance.SEASON_POINTS_BY_POSITION[0]).toBe(25)
    expect(balance.VOTING_CLOSE_EXCLUSIVE_AT.hour).toBe(0)
  })

  it('solo exporta números, cadenas y datos congelados (sin funciones ni estado)', () => {
    for (const [name, value] of Object.entries(balance)) {
      const ok = typeof value === 'number' || typeof value === 'string' || Object.isFrozen(value)
      expect(ok, name).toBe(true)
    }
  })
})
