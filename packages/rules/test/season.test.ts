import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  addDays,
  isLastWeekOfSeason,
  isoWeekLabel,
  type LocalDate,
  scheduleWeek,
  seasonEndsAt,
  seasonOf,
} from '../src/calendar'
import {
  isSeasonClosed,
  type SeasonResult,
  type SeasonWeek,
  seasonChampions,
  seasonPoints,
  seasonStandings,
} from '../src/season'

describe('seasonPoints', () => {
  it('RF-ARC-03: 25, 18, 15, 12, 10, 8, 6, 4, 2, 1 del 1.º al 10.º (Anexo B)', () => {
    const table = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]
    table.forEach((points, i) => {
      expect(seasonPoints(i + 1, true), `posición ${i + 1}`).toBe(points)
    })
  })

  it('RF-ARC-03: 1 punto por cada entrada clasificada fuera del top 10', () => {
    expect(seasonPoints(11, true)).toBe(1)
    expect(seasonPoints(50, true)).toBe(1)
    expect(seasonPoints(1_000, true)).toBe(1)
  })

  it('RF-ARC-03: una entrada sin clasificar no suma', () => {
    expect(seasonPoints(1, false)).toBe(0)
    expect(seasonPoints(11, false)).toBe(0)
  })

  it('un ex aequo comparte posición y puntos (1, 1, 3)', () => {
    expect([1, 1, 3].map((position) => seasonPoints(position, true))).toEqual([25, 25, 15])
  })

  it('peor posición nunca da más puntos, y siempre al menos 1 si clasifica', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 500 }), fc.integer({ min: 0, max: 500 }), (position, drop) => {
        const points = seasonPoints(position, true)
        expect(points).toBeGreaterThanOrEqual(1)
        expect(seasonPoints(position + drop, true)).toBeLessThanOrEqual(points)
      }),
    )
  })

  it('rechaza posiciones imposibles', () => {
    expect(() => seasonPoints(0, true)).toThrow(RangeError)
    expect(() => seasonPoints(-1, true)).toThrow(RangeError)
    expect(() => seasonPoints(1.5, true)).toThrow(RangeError)
    expect(() => seasonPoints(Number.NaN, false)).toThrow(RangeError)
  })
})

/** Filas de una temporada: `[productor, semana, posición, puntuación × 1000]`. */
function rows(...list: [string, number, number | null, number][]): SeasonResult[] {
  return list.map(([userId, week, position, scoreMilli]) => ({
    userId,
    weekId: `w${week}`,
    position,
    scoreMilli,
  }))
}

const summary = (results: readonly SeasonResult[]) =>
  seasonStandings(results).map((s) => [s.userId, s.position, s.points, s.wins, s.podiums])

describe('seasonStandings', () => {
  it('RF-ARC-03: suma los puntos de la tabla del Anexo B de cada semana sellada', () => {
    const table = seasonStandings(
      rows(
        ['ana', 1, 1, 4200],
        ['ana', 2, 3, 3900],
        ['ana', 3, 4, 3100],
        ['bea', 1, 2, 4100],
        ['bea', 2, 1, 4300],
      ),
    )
    expect(table).toEqual([
      {
        userId: 'ana',
        position: 1,
        points: 25 + 15 + 12,
        wins: 1,
        podiums: 2,
        weeks: 3,
        scoreSumMilli: 11_200,
      },
      { userId: 'bea', position: 2, points: 18 + 25, wins: 1, podiums: 2, weeks: 2, scoreSumMilli: 8400 },
    ])
  })

  it('RF-ARC-03: con los mismos puntos, desempata quien tiene más victorias', () => {
    // ana: 25 + 1 = 26; bea: 18 + 8 = 26. ana tiene una victoria.
    expect(
      summary(rows(['ana', 1, 1, 4000], ['ana', 2, 11, 3000], ['bea', 1, 2, 3900], ['bea', 2, 6, 3500])),
    ).toEqual([
      ['ana', 1, 26, 1, 1],
      ['bea', 2, 26, 0, 1],
    ])
  })

  it('RF-ARC-03: con los mismos puntos y victorias, desempata quien tiene más podios', () => {
    // ana: 15 + 15 = 30 (2 podios); bea: 18 + 12 = 30 (1 podio).
    expect(
      summary(rows(['bea', 1, 2, 4000], ['bea', 2, 4, 3800], ['ana', 1, 3, 3700], ['ana', 2, 3, 3600])),
    ).toEqual([
      ['ana', 1, 30, 0, 2],
      ['bea', 2, 30, 0, 1],
    ])
  })

  it('RF-ARC-03: con los mismos puntos, victorias y podios, desempata la mejor puntuación media (exacta)', () => {
    // ana: 10 + 10 = 20 en 2 semanas (media 3,9005); bea: 10 + 8 + 1 + 1 = 20 en 4 semanas (media 3,9).
    const table = seasonStandings(
      rows(
        ['ana', 1, 5, 3901],
        ['ana', 2, 5, 3900],
        ['bea', 1, 5, 4000],
        ['bea', 2, 6, 3900],
        ['bea', 3, 11, 3850],
        ['bea', 4, 11, 3850],
      ),
    )
    expect(table.map((s) => [s.userId, s.position, s.points])).toEqual([
      ['ana', 1, 20],
      ['bea', 2, 20],
    ])
    // La misma media con distinto número de semanas empata (7800 / 2 = 15 600 / 4).
    const tied = seasonStandings(
      rows(
        ['ana', 1, 5, 3900],
        ['ana', 2, 5, 3900],
        ['bea', 1, 5, 3900],
        ['bea', 2, 6, 3900],
        ['bea', 3, 11, 3900],
        ['bea', 4, 11, 3900],
      ),
    )
    expect(tied.map((s) => s.position)).toEqual([1, 1])
  })

  it('RF-ARC-03: con todo empatado comparten posición (1, 1, 3) y son campeones ex aequo', () => {
    const table = seasonStandings(
      rows(['cris', 1, 1, 4000], ['ana', 2, 1, 4000], ['bea', 3, 2, 3900], ['dani', 1, 1, 4000]),
    )
    expect(table.map((s) => [s.userId, s.position])).toEqual([
      ['ana', 1],
      ['cris', 1],
      ['dani', 1],
      ['bea', 4],
    ])
    expect(seasonChampions(table)).toEqual(['ana', 'cris', 'dani'])
  })

  it('RF-ARC-03: victorias y podios cuentan los ex aequo de la semana', () => {
    // Semana 1 con dos primeros (1, 1, 3).
    const table = seasonStandings(rows(['ana', 1, 1, 4000], ['bea', 1, 1, 4000], ['cris', 1, 3, 3800]))
    expect(table.map((s) => [s.userId, s.position, s.points, s.wins, s.podiums])).toEqual([
      ['ana', 1, 25, 1, 1],
      ['bea', 1, 25, 1, 1],
      ['cris', 3, 15, 0, 1],
    ])
  })

  it('RF-ARC-03: solo entra quien tiene alguna entrada clasificada; las sin clasificar no suman', () => {
    const table = seasonStandings(rows(['ana', 1, 7, 3500], ['ana', 2, null, 3200], ['bea', 1, null, 4800]))
    expect(table).toEqual([
      { userId: 'ana', position: 1, points: 6, wins: 0, podiums: 0, weeks: 1, scoreSumMilli: 3500 },
    ])
    // Sin ninguna clasificada no hay tabla ni campeón.
    expect(seasonStandings(rows(['bea', 1, null, 4800]))).toEqual([])
    expect(seasonChampions(seasonStandings([]))).toEqual([])
  })

  it('RF-ARC-03: es una función pura del conjunto de filas y la tabla va en orden', () => {
    const results = fc.array(
      fc.record({
        userId: fc.constantFrom('ana', 'bea', 'cris', 'dani', 'eva'),
        weekId: fc.constantFrom('w1', 'w2', 'w3', 'w4', 'w5', 'w6'),
        position: fc.option(fc.integer({ min: 1, max: 14 }), { nil: null }),
        scoreMilli: fc.integer({ min: 1000, max: 5000 }),
      }),
      { maxLength: 30 },
    )
    const unique = results.map((list) => {
      const seen = new Set<string>()
      return list.filter((r) => !seen.has(`${r.userId}/${r.weekId}`) && seen.add(`${r.userId}/${r.weekId}`))
    })
    fc.assert(
      fc.property(
        unique.chain((list) =>
          fc.tuple(fc.constant(list), fc.shuffledSubarray(list, { minLength: list.length })),
        ),
        ([list, shuffled]) => {
          const table = seasonStandings(list)
          expect(seasonStandings(shuffled)).toEqual(table)
          table.forEach((row, i) => {
            const mine = list.filter((r) => r.userId === row.userId && r.position !== null)
            expect(row.points).toBe(
              mine.reduce((acc, r) => acc + seasonPoints(r.position as number, true), 0),
            )
            expect(row.weeks).toBe(mine.length)
            expect(row.points).toBeGreaterThanOrEqual(1)
            const previous = table[i - 1]
            if (previous) {
              expect(row.position).toBeGreaterThanOrEqual(previous.position)
              expect(row.points).toBeLessThanOrEqual(previous.points)
              if (row.position !== previous.position) expect(row.position).toBe(i + 1)
            } else expect(row.position).toBe(1)
          })
          const qualifiedUsers = new Set(list.filter((r) => r.position !== null).map((r) => r.userId))
          expect(table.map((r) => r.userId).sort()).toEqual([...qualifiedUsers].sort())
        },
      ),
    )
  })

  it('rechaza dos filas del mismo productor en la misma semana y puntuaciones imposibles', () => {
    expect(() => seasonStandings(rows(['ana', 1, 1, 4000], ['ana', 1, 2, 3900]))).toThrow(RangeError)
    expect(() => seasonStandings(rows(['ana', 1, 0, 4000]))).toThrow(RangeError)
    expect(() => seasonStandings(rows(['ana', 1, 1, 3.5]))).toThrow(RangeError)
  })
})

describe('temporada de una semana', () => {
  it('RF-ARC-04: la semana que empieza el 2026-12-28 es de 2026-T4', () => {
    const monday: LocalDate = { year: 2026, month: 12, day: 28 }
    expect(seasonOf(monday)).toBe('2026-T4')
    // Aunque su jueves y su semana ISO son de 2026 y su domingo ya es de 2027.
    expect(isoWeekLabel(monday)).toBe('2026-W53')
    expect(addDays(monday, 6)).toEqual({ year: 2027, month: 1, day: 3 })
    // Y es la última de la 2026-T4: la siguiente abre la 2027-T1.
    expect(isLastWeekOfSeason(monday)).toBe(true)
    expect(seasonOf(addDays(monday, 7))).toBe('2027-T1')
  })

  it('RF-ARC-05: cada temporada tiene una sola última semana, la de su último lunes', () => {
    const first: LocalDate = { year: 2026, month: 1, day: 5 }
    const finales = new Map<string, string[]>()
    for (let week = 0; week < 52 * 3; week++) {
      const monday = addDays(first, 7 * week)
      if (isLastWeekOfSeason(monday))
        finales.set(seasonOf(monday), [...(finales.get(seasonOf(monday)) ?? []), isoWeekLabel(monday)])
    }
    for (const [season, list] of finales) expect(list, season).toHaveLength(1)
    expect(finales.get('2026-T1')).toEqual(['2026-W14'])
    expect(finales.get('2026-T3')).toEqual(['2026-W40'])
    expect(finales.get('2026-T4')).toEqual(['2026-W53'])
    expect(isLastWeekOfSeason({ year: 2026, month: 12, day: 21 })).toBe(false)
  })
})

describe('cierre de la temporada (hueco G7)', () => {
  /** Las semanas de la 2026-T4 (lunes del 5 de octubre al 28 de diciembre), selladas o no. */
  const t4 = (count: number, sealed = true): SeasonWeek[] =>
    Array.from({ length: count }, (_, i) => ({
      monday: addDays({ year: 2026, month: 10, day: 5 }, 7 * i),
      sealed,
    }))

  it('RF-ARC-05: el trimestre acaba a las 00:00 (hora de Madrid) del día 1 del siguiente', () => {
    expect(seasonEndsAt('2026-T4')).toBe(Date.UTC(2026, 11, 31, 23)) // CET, UTC+1
    expect(seasonEndsAt('2026-T2')).toBe(Date.UTC(2026, 5, 30, 22)) // CEST, UTC+2
    expect(seasonEndsAt('2027-T1')).toBe(Date.UTC(2027, 2, 31, 22))
    expect(() => seasonEndsAt('2026-T5')).toThrow(RangeError)
    expect(() => seasonEndsAt('2026-4')).toThrow(RangeError)
  })

  it('RF-ARC-05: la semana de su último lunes cierra siempre después de que acabe el trimestre', () => {
    const first: LocalDate = { year: 2024, month: 1, day: 1 }
    for (let week = 0; week < 52 * 12; week++) {
      const monday = addDays(first, 7 * week)
      if (!isLastWeekOfSeason(monday)) continue
      const season = seasonOf(monday)
      expect(scheduleWeek(monday).voteEndsAt, season).toBeGreaterThanOrEqual(seasonEndsAt(season))
      // Y la anterior cierra antes: su sellado nunca cierra la temporada a tiempo.
      expect(scheduleWeek(addDays(monday, -7)).voteEndsAt, season).toBeLessThanOrEqual(seasonEndsAt(season))
    }
  })

  it('RF-ARC-05: sellada la semana de su último lunes (las 13), la temporada queda cerrada al sellarla', () => {
    const weeks = t4(13)
    expect(isLastWeekOfSeason((weeks.at(-1) as SeasonWeek).monday)).toBe(true)
    const sealing = scheduleWeek({ year: 2026, month: 12, day: 28 }).voteEndsAt
    expect(isSeasonClosed('2026-T4', weeks, sealing)).toBe(true)
    // Con la última aún sin sellar, no.
    expect(
      isSeasonClosed(
        '2026-T4',
        [...t4(12), { monday: { year: 2026, month: 12, day: 28 }, sealed: false }],
        sealing,
      ),
    ).toBe(false)
  })

  it('G7: sin semana el último lunes, cierra en cuanto acaba el trimestre con todas sus semanas selladas', () => {
    const weeks = t4(12) // hasta la del 21 de diciembre
    const end = seasonEndsAt('2026-T4')
    expect(isSeasonClosed('2026-T4', weeks, end - 1)).toBe(false)
    expect(isSeasonClosed('2026-T4', weeks, end)).toBe(true)
    // Una sin sellar la deja abierta aunque haya acabado el trimestre (la sellará el tick, y entonces cierra).
    expect(
      isSeasonClosed(
        '2026-T4',
        [...t4(11), { monday: { year: 2026, month: 12, day: 21 }, sealed: false }],
        end + 1,
      ),
    ).toBe(false)
  })

  it('G7: una temporada sin semanas no se cierra nunca; una semana de otra temporada no vale', () => {
    expect(isSeasonClosed('2026-T4', [], seasonEndsAt('2026-T4') + 1)).toBe(false)
    expect(() =>
      isSeasonClosed('2026-T4', [{ monday: { year: 2027, month: 1, day: 4 }, sealed: true }], 0),
    ).toThrow(RangeError)
  })

  it('G7: cerrada no depende del orden de las semanas y, una vez cerrada, sigue cerrada', () => {
    fc.assert(
      fc.property(
        fc.shuffledSubarray(t4(13), { minLength: 1 }),
        fc.integer({ min: 0, max: 30 * 86_400_000 }),
        fc.integer({ min: 0, max: 30 * 86_400_000 }),
        (weeks, a, b) => {
          const at = seasonEndsAt('2026-T4') - 15 * 86_400_000
          const reversed = [...weeks].reverse()
          expect(isSeasonClosed('2026-T4', weeks, at + a)).toBe(isSeasonClosed('2026-T4', reversed, at + a))
          if (isSeasonClosed('2026-T4', weeks, at + Math.min(a, b)))
            expect(isSeasonClosed('2026-T4', weeks, at + Math.max(a, b))).toBe(true)
        },
      ),
    )
  })
})
