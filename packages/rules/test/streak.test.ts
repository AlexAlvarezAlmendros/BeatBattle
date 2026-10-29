import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { streakBonusPercent } from '../src/levels'
import {
  advanceStreak,
  jokerAvailable,
  STREAK_START,
  type StreakState,
  type StreakWeek,
  streakInPlay,
  streakOf,
  xpFor,
} from '../src/xp'

/** Semanas 1, 2, 3… con su temporada (13 por temporada) y si clasificó. */
function weeks(qualified: readonly boolean[], firstNumber = 1, perSeason = 13): StreakWeek[] {
  return qualified.map((q, i) => {
    const number = firstNumber + i
    const quarter = Math.floor((number - 1) / perSeason)
    return { number, seasonId: `${2026 + Math.floor(quarter / 4)}-T${(quarter % 4) + 1}`, qualified: q }
  })
}

/** Cada estado tras cada semana. */
function trace(history: readonly StreakWeek[]): StreakState[] {
  const out: StreakState[] = []
  let state = STREAK_START
  for (const week of history) {
    state = advanceStreak(state, week)
    out.push(state)
  }
  return out
}

const seasonHistory = fc
  .array(fc.boolean(), { maxLength: 80 })
  .chain((qualified) => fc.constantFrom(1, 4, 13).map((perSeason) => weeks(qualified, 1, perSeason)))

describe('racha con comodín', () => {
  it('RF-GAME-04: escenario de aceptación: 4 semanas, falla la 5.ª (gasta el comodín), falla la 6.ª (se rompe)', () => {
    const history = weeks([true, true, true, true, false, false])
    const states = trace(history)
    expect(states.map((s) => s.current)).toEqual([1, 2, 3, 4, 4, 0])
    // La 5.ª gasta el comodín de su temporada; la 6.ª, en la misma temporada, ya no lo tiene.
    expect(states[3]?.jokerSeason).toBeNull()
    expect(states[4]?.jokerSeason).toBe('2026-T1')
    expect(jokerAvailable(states[4] as StreakState, '2026-T1')).toBe(false)
    expect(streakOf(history)).toEqual({ current: 0, best: 4, lastWeekNumber: 6, jokerSeason: '2026-T1' })
    // Si vuelve a clasificar la 7.ª, empieza en 1.
    expect(
      advanceStreak(streakOf(history), { number: 7, seasonId: '2026-T1', qualified: true }).current,
    ).toBe(1)
  })

  it('RF-GAME-04: la semana salvada por el comodín no suma: 4, comodín, clasifica → 5', () => {
    const states = trace(weeks([true, true, true, true, false, true]))
    expect(states.map((s) => s.current)).toEqual([1, 2, 3, 4, 4, 5])
    // El bonus sigue a la racha: 30 % con 4 (también la semana salvada) y 40 % con 5.
    expect(states.map((s) => streakBonusPercent(s.current))).toEqual([0, 10, 20, 30, 30, 40])
  })

  it('RF-GAME-04: un comodín por temporada; la temporada siguiente trae otro', () => {
    // Temporadas de 4 semanas: T1 = 1–4, T2 = 5–8. Falla la 4.ª (T1) y la 5.ª (T2): cada una gasta el de la suya.
    const history = weeks([true, true, true, false, false, true], 1, 4)
    const states = trace(history)
    expect(states.map((s) => s.current)).toEqual([1, 2, 3, 3, 3, 4])
    expect(states.map((s) => s.jokerSeason)).toEqual([null, null, null, '2026-T1', '2026-T2', '2026-T2'])
    // Dos fallos en la misma temporada sí la rompen, aunque estén separados.
    expect(trace(weeks([true, false, true, false], 1, 4)).map((s) => s.current)).toEqual([1, 1, 2, 0])
  })

  it('RF-GAME-04: sin racha que salvar no se gasta el comodín', () => {
    const states = trace(weeks([false, false, true, false]))
    expect(states.map((s) => s.current)).toEqual([0, 0, 1, 1])
    expect(states.map((s) => s.jokerSeason)).toEqual([null, null, null, '2026-T1'])
  })

  it('RF-GAME-04: la mejor racha es la más larga', () => {
    const state = streakOf(weeks([true, true, true, false, false, true, true]))
    expect(state).toMatchObject({ current: 2, best: 3 })
  })

  it('RF-GAME-04: aplicar una semana ya aplicada no cambia nada (re-sellar no la cuenta dos veces)', () => {
    fc.assert(
      fc.property(seasonHistory, (history) => {
        let state = STREAK_START
        for (const week of history) {
          state = advanceStreak(state, week)
          expect(advanceStreak(state, week)).toBe(state)
          // Ni ninguna anterior.
          if (history[0]) expect(advanceStreak(state, history[0])).toBe(state)
        }
      }),
    )
  })

  it('RF-GAME-04: propiedades: 0 ≤ actual ≤ mejor ≤ semanas clasificadas, y nunca dos fallos seguidos en pie', () => {
    fc.assert(
      fc.property(seasonHistory, (history) => {
        const states = trace(history)
        let qualifiedSoFar = 0
        states.forEach((state, i) => {
          const week = history[i] as StreakWeek
          if (week.qualified) qualifiedSoFar += 1
          expect(state.current).toBeGreaterThanOrEqual(0)
          expect(state.current).toBeLessThanOrEqual(state.best)
          expect(state.best).toBeLessThanOrEqual(qualifiedSoFar)
          expect(state.lastWeekNumber).toBe(week.number)
          if (week.qualified)
            expect(state.current).toBe((i === 0 ? 0 : (states[i - 1] as StreakState).current) + 1)
          // Dos semanas falladas seguidas de la misma temporada siempre la rompen.
          const before = history[i - 1]
          if (!week.qualified && before && !before.qualified && before.seasonId === week.seasonId)
            expect(state.current).toBe(0)
        })
      }),
    )
  })

  it('RF-GAME-04: streakOf es aplicar las semanas una a una, y se puede partir en cualquier punto', () => {
    fc.assert(
      fc.property(seasonHistory, fc.nat(), (history, cut) => {
        const at = history.length === 0 ? 0 : cut % (history.length + 1)
        const head = streakOf(history.slice(0, at))
        const resumed = history.slice(at).reduce(advanceStreak, head)
        expect(resumed).toEqual(streakOf(history))
      }),
    )
  })

  it('un hueco de números solo vale sin racha (no hay nada que perder)', () => {
    const idle = streakOf(weeks([true, false, false]))
    expect(idle.current).toBe(0)
    expect(advanceStreak(idle, { number: 9, seasonId: '2026-T1', qualified: true })).toMatchObject({
      current: 1,
      lastWeekNumber: 9,
    })
    const alive = streakOf(weeks([true, true]))
    expect(() => advanceStreak(alive, { number: 4, seasonId: '2026-T1', qualified: true })).toThrow(
      RangeError,
    )
    expect(() => streakOf([...weeks([true]), ...weeks([true], 3)])).toThrow(RangeError)
  })

  it('rechaza historias fuera de orden y semanas imposibles', () => {
    expect(() => streakOf([...weeks([true], 2), ...weeks([true], 1)])).toThrow(RangeError)
    expect(() => streakOf([...weeks([true], 2), ...weeks([true], 2)])).toThrow(RangeError)
    expect(() => advanceStreak(STREAK_START, { number: 0, seasonId: '2026-T1', qualified: true })).toThrow(
      RangeError,
    )
    expect(() => advanceStreak(STREAK_START, { number: 1.5, seasonId: '2026-T1', qualified: true })).toThrow(
      RangeError,
    )
    expect(() => advanceStreak(STREAK_START, { number: 1, seasonId: '', qualified: true })).toThrow(
      RangeError,
    )
  })

  it('RF-GAME-04: la racha en juego (la de las semanas selladas más esta) paga subir y, si clasifica, el resultado', () => {
    const before = streakOf(weeks([true, true, true]))
    const inPlay = streakInPlay(before)
    expect(inPlay).toBe(4)
    expect(xpFor({ kind: 'entry' }, { goldenWeek: false, streakWeeks: inPlay })).toBe(130)
    // Al sellar, si clasifica, la racha de la semana es la misma que la que pagó la subida.
    const after = advanceStreak(before, { number: 4, seasonId: '2026-T1', qualified: true })
    expect(after.current).toBe(inPlay)
    // Con la racha rota, la semana en juego es la 1.ª: sin bonus.
    expect(streakInPlay(streakOf(weeks([true, false, false])))).toBe(1)
  })
})
