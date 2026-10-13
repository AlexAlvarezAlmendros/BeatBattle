import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  addDays,
  isoWeekdayOf,
  isoWeekLabel,
  type LocalDate,
  localDateOf,
  mondayOf,
  mondayOfSlug,
  nextMonday,
  parseLocalDate,
  scheduleWeek,
  seasonOf,
  weekSlug,
  zonedInstant,
} from '../src/calendar'

const HOUR = 3_600_000
const MADRID = 'Europe/Madrid'

/** Hora de pared de un instante en Madrid, con un formateador de referencia distinto del del módulo. */
function madridWall(instant: number) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: MADRID,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant)
  const get = (type: string) => parts.find((part) => part.type === type)?.value
  return {
    weekday: new Intl.DateTimeFormat('en-US', { timeZone: MADRID, weekday: 'short' }).format(instant),
    text: `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`,
  }
}

/**
 * Un lunes cualquiera entre 1996 y 2090. Desde 1996 rige la regla de la UE (último domingo de marzo y de
 * octubre); antes, España atrasaba la hora en septiembre.
 */
const mondays = fc
  .integer({ min: 0, max: 4_900 })
  .map((weeks) => addDays({ year: 1996, month: 1, day: 1 }, weeks * 7))

/** Último domingo de marzo u octubre. */
function lastSunday(year: number, month: 3 | 10): LocalDate {
  const last = addDays({ year, month: month + 1, day: 1 }, -1)
  return addDays(last, -(isoWeekdayOf(last) % 7))
}

describe('scheduleWeek', () => {
  it('RF-DROP-05: la semana del último domingo de marzo dura 167 h y la de octubre 169 h', () => {
    // 2026: el horario de verano empieza el domingo 29 de marzo y acaba el domingo 25 de octubre.
    const march = scheduleWeek({ year: 2026, month: 3, day: 23 })
    const october = scheduleWeek({ year: 2026, month: 10, day: 19 })
    const normal = scheduleWeek({ year: 2026, month: 10, day: 5 })
    expect((march.voteEndsAt - march.startsAt) / HOUR).toBe(167)
    expect((october.voteEndsAt - october.startsAt) / HOUR).toBe(169)
    expect((normal.voteEndsAt - normal.startsAt) / HOUR).toBe(168)
  })

  it('RF-DROP-05: los instantes de la semana 41 de 2026 (horario de verano, UTC+2)', () => {
    expect(scheduleWeek({ year: 2026, month: 10, day: 5 })).toEqual({
      startsAt: Date.UTC(2026, 9, 4, 22, 0, 0),
      submitEndsAt: Date.UTC(2026, 9, 11, 18, 0, 0),
      voteEndsAt: Date.UTC(2026, 9, 11, 22, 0, 0),
    })
  })

  it('RF-DROP-05: en invierno (UTC+1) y en la semana del cambio de octubre', () => {
    expect(scheduleWeek({ year: 2026, month: 12, day: 14 }).startsAt).toBe(Date.UTC(2026, 11, 13, 23, 0, 0))
    const october = scheduleWeek({ year: 2026, month: 10, day: 19 })
    expect(october.startsAt).toBe(Date.UTC(2026, 9, 18, 22, 0, 0))
    expect(october.submitEndsAt).toBe(Date.UTC(2026, 9, 25, 19, 0, 0))
    expect(october.voteEndsAt).toBe(Date.UTC(2026, 9, 25, 23, 0, 0))
  })

  it('RF-DROP-05: las fronteras son lunes 00:00 y domingo 20:00 de pared en Madrid, siempre', () => {
    fc.assert(
      fc.property(mondays, (monday) => {
        const week = scheduleWeek(monday)
        expect(madridWall(week.startsAt)).toEqual({ weekday: 'Mon', text: `${fmt(monday)} 00:00:00` })
        expect(madridWall(week.submitEndsAt)).toEqual({
          weekday: 'Sun',
          text: `${fmt(addDays(monday, 6))} 20:00:00`,
        })
        expect(madridWall(week.voteEndsAt)).toEqual({
          weekday: 'Mon',
          text: `${fmt(addDays(monday, 7))} 00:00:00`,
        })
      }),
      { numRuns: 400 },
    )
  })

  it('RF-DROP-05: 167 h solo con el último domingo de marzo, 169 h solo con el de octubre y 168 h el resto', () => {
    fc.assert(
      fc.property(mondays, (monday) => {
        const week = scheduleWeek(monday)
        const sunday = addDays(monday, 6)
        const expected =
          fmt(sunday) === fmt(lastSunday(sunday.year, 3))
            ? 167
            : fmt(sunday) === fmt(lastSunday(sunday.year, 10))
              ? 169
              : 168
        expect((week.voteEndsAt - week.startsAt) / HOUR).toBe(expected)
        // El tramo de solo votación (domingo 20:00 → lunes 00:00) dura siempre 4 h justas (§2.1).
        expect(week.voteEndsAt - week.submitEndsAt).toBe(4 * HOUR)
      }),
      { numRuns: 400 },
    )
  })

  it('RF-DROP-01: las semanas consecutivas encadenan sin hueco ni solape', () => {
    fc.assert(
      fc.property(mondays, (monday) => {
        expect(scheduleWeek(addDays(monday, 7)).startsAt).toBe(scheduleWeek(monday).voteEndsAt)
      }),
    )
  })

  it('rechaza un día que no es lunes y fechas que no existen', () => {
    expect(() => scheduleWeek({ year: 2026, month: 10, day: 6 })).toThrow(RangeError)
    expect(() => scheduleWeek({ year: 2026, month: 2, day: 30 })).toThrow(RangeError)
    expect(() => scheduleWeek({ year: 2026, month: 13, day: 1 })).toThrow(RangeError)
    expect(() => scheduleWeek({ year: 2026.5, month: 1, day: 5 })).toThrow(RangeError)
  })
})

describe('mondayOf', () => {
  it('RF-DROP-01: un instante pertenece a la semana [lunes 00:00, lunes siguiente 00:00), al milisegundo', () => {
    fc.assert(
      fc.property(mondays, fc.double({ min: 0, max: 1, noNaN: true }), (monday, at) => {
        const week = scheduleWeek(monday)
        const inside = week.startsAt + Math.floor(at * (week.voteEndsAt - week.startsAt - 1))
        expect(mondayOf(week.startsAt)).toEqual(monday)
        expect(mondayOf(inside)).toEqual(monday)
        expect(mondayOf(week.voteEndsAt - 1)).toEqual(monday)
        expect(mondayOf(week.voteEndsAt)).toEqual(addDays(monday, 7))
        expect(mondayOf(week.startsAt - 1)).toEqual(addDays(monday, -7))
        expect(nextMonday(inside)).toEqual(addDays(monday, 7))
      }),
      { numRuns: 300 },
    )
  })
})

describe('zonedInstant y localDateOf', () => {
  it('la hora repetida al atrasar el reloj da la primera; la que no existe al adelantarlo, error', () => {
    // 25-10-2026: a las 03:00 (verano) vuelven a ser las 02:00 (invierno).
    expect(zonedInstant({ year: 2026, month: 10, day: 25 }, { hour: 2, minute: 30, second: 0 })).toBe(
      Date.UTC(2026, 9, 25, 0, 30, 0),
    )
    // 29-03-2026: de las 02:00 se salta a las 03:00.
    expect(() => zonedInstant({ year: 2026, month: 3, day: 29 }, { hour: 2, minute: 30, second: 0 })).toThrow(
      RangeError,
    )
  })

  it('ida y vuelta: el día de pared de un instante coincide con el del formateador de referencia', () => {
    fc.assert(
      fc.property(fc.integer({ min: Date.UTC(1990, 0, 1), max: Date.UTC(2090, 0, 1) }), (instant) => {
        expect(fmt(localDateOf(instant))).toBe(madridWall(instant).text.slice(0, 10))
      }),
    )
  })

  it('acepta otra zona explícita', () => {
    expect(scheduleWeek({ year: 2026, month: 10, day: 5 }, 'UTC').startsAt).toBe(Date.UTC(2026, 9, 5))
  })
})

describe('semana ISO, slug y temporada', () => {
  it('etiquetas conocidas, incluidas las que cruzan el año', () => {
    expect(isoWeekLabel({ year: 2026, month: 10, day: 5 })).toBe('2026-W41')
    expect(isoWeekLabel({ year: 2024, month: 12, day: 30 })).toBe('2025-W01')
    expect(isoWeekLabel({ year: 2020, month: 12, day: 28 })).toBe('2020-W53')
    expect(isoWeekLabel({ year: 2027, month: 1, day: 4 })).toBe('2027-W01')
    expect(weekSlug({ year: 2026, month: 10, day: 5 })).toBe('2026-w41')
  })

  it('el slug va y vuelve al mismo lunes', () => {
    fc.assert(
      fc.property(mondays, (monday) => {
        expect(mondayOfSlug(weekSlug(monday))).toEqual(monday)
      }),
    )
    expect(() => mondayOfSlug('2026-w54')).toThrow(RangeError)
    expect(() => mondayOfSlug('2021-w53')).toThrow(RangeError)
    expect(() => mondayOfSlug('2026-W41')).toThrow(RangeError)
    expect(() => mondayOfSlug('2026-w00')).toThrow(RangeError)
  })

  it('el número de semana sube de uno en uno y vuelve a 1 al cambiar de año ISO', () => {
    fc.assert(
      fc.property(mondays, (monday) => {
        const [year, week] = isoWeekLabel(monday).split('-W').map(Number) as [number, number]
        const [nextYear, nextWeek] = isoWeekLabel(addDays(monday, 7)).split('-W').map(Number) as [
          number,
          number,
        ]
        if (nextYear === year) expect(nextWeek).toBe(week + 1)
        else expect([nextYear, nextWeek, week >= 52]).toEqual([year + 1, 1, true])
      }),
    )
  })

  it('§2.9: la temporada es el trimestre natural del lunes de la semana', () => {
    expect(seasonOf({ year: 2026, month: 10, day: 5 })).toBe('2026-T4')
    expect(seasonOf({ year: 2026, month: 3, day: 30 })).toBe('2026-T1')
    expect(seasonOf({ year: 2026, month: 4, day: 6 })).toBe('2026-T2')
    // Cruza el año: es de la temporada de su lunes, aunque su semana ISO sea la 1 de 2025.
    expect(seasonOf({ year: 2024, month: 12, day: 30 })).toBe('2024-T4')
  })
})

describe('parseLocalDate', () => {
  it('lee fechas válidas y rechaza las que no existen', () => {
    expect(parseLocalDate('2026-10-05')).toEqual({ year: 2026, month: 10, day: 5 })
    expect(() => parseLocalDate('2026-02-29')).toThrow(RangeError)
    expect(() => parseLocalDate('2026-10-5')).toThrow(RangeError)
    expect(() => parseLocalDate('05/10/2026')).toThrow(RangeError)
  })
})

function fmt(date: LocalDate): string {
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
}
