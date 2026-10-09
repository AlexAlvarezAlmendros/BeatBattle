import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { LAST_HOUR_MS } from '../src/balance'
import { addDays, scheduleWeek } from '../src/calendar'
import { canDownload, canSubmit, canVote, countdownOf, phaseOf, type WeekTimes } from '../src/phase'

const mondays = fc
  .integer({ min: 0, max: 4_900 })
  .map((weeks) => addDays({ year: 1996, month: 1, day: 1 }, weeks * 7))

/** Una semana programada, con o sin sellar (el sellado llega como mucho un día después del cierre). */
const weeks = fc
  .tuple(mondays, fc.option(fc.integer({ min: 0, max: 86_400_000 })))
  .map(([monday, sealDelay]): WeekTimes => {
    const week = scheduleWeek(monday)
    return { ...week, sealedAt: sealDelay === null ? null : week.voteEndsAt + sealDelay }
  })

const W41: WeekTimes = { ...scheduleWeek({ year: 2026, month: 10, day: 5 }), sealedAt: null }

describe('phaseOf', () => {
  it('RF-DROP-01: la fase de la tabla de §2.1 en cada frontera, al milisegundo', () => {
    fc.assert(
      fc.property(weeks, (week) => {
        expect(phaseOf(week, week.startsAt - 1)).toBe('scheduled')
        expect(phaseOf(week, week.startsAt)).toBe('open')
        expect(phaseOf(week, week.submitEndsAt - 1)).toBe('open')
        expect(phaseOf(week, week.submitEndsAt)).toBe('voting')
        expect(phaseOf(week, week.voteEndsAt - 1)).toBe('voting')
        expect(phaseOf(week, week.voteEndsAt)).toBe(week.sealedAt === null ? 'sealing' : 'sealed')
      }),
      { numRuns: 300 },
    )
  })

  it('RF-DROP-01: la fase solo avanza con el tiempo (scheduled → open → voting → sealing/sealed)', () => {
    const order = ['scheduled', 'open', 'voting', 'sealing', 'sealed']
    fc.assert(
      fc.property(weeks, fc.integer({ min: -1e9, max: 1e9 }), fc.nat(1e9), (week, offset, step) => {
        const a = week.startsAt + offset
        expect(order.indexOf(phaseOf(week, a + step))).toBeGreaterThanOrEqual(order.indexOf(phaseOf(week, a)))
      }),
    )
  })

  it('RF-DROP-01: sin sellar, tras el cierre está «sealing» para siempre; sellada, «sealed»', () => {
    expect(phaseOf(W41, W41.voteEndsAt + 365 * 86_400_000)).toBe('sealing')
    expect(phaseOf({ ...W41, sealedAt: W41.voteEndsAt + 5 }, W41.voteEndsAt + 1)).toBe('sealed')
  })

  it('rechaza instantes imposibles', () => {
    expect(() => phaseOf({ ...W41, submitEndsAt: W41.startsAt }, W41.startsAt)).toThrow(RangeError)
    expect(() => phaseOf({ ...W41, voteEndsAt: W41.submitEndsAt - 1 }, W41.startsAt)).toThrow(RangeError)
    expect(() => phaseOf(W41, Number.NaN)).toThrow(RangeError)
  })
})

describe('canSubmit, canVote y canDownload', () => {
  it('RF-DROP-01: subir y descargar solo en «open»; votar en «open» y «voting»', () => {
    fc.assert(
      fc.property(weeks, fc.integer({ min: -2e9, max: 2e9 }), (week, offset) => {
        const now = week.submitEndsAt + offset
        const phase = phaseOf(week, now)
        expect(canSubmit(week, now)).toBe(phase === 'open')
        expect(canDownload(week, now)).toBe(phase === 'open')
        expect(canVote(week, now)).toBe(phase === 'open' || phase === 'voting')
      }),
    )
  })
})

describe('countdownOf', () => {
  it('RF-DROP-10: cuenta hasta el cierre de envíos en «open» y hasta el de votos en «voting»', () => {
    expect(countdownOf(W41, W41.startsAt)).toEqual({
      closes: 'submissions',
      target: W41.submitEndsAt,
      remainingMs: W41.submitEndsAt - W41.startsAt,
      lastHour: false,
    })
    expect(countdownOf(W41, W41.submitEndsAt)).toMatchObject({ closes: 'votes', target: W41.voteEndsAt })
    expect(countdownOf(W41, W41.startsAt - 1)).toBeNull()
    expect(countdownOf(W41, W41.voteEndsAt)).toBeNull()
  })

  it('RF-DROP-10: «hora loca» con 59 min 59 s por delante (y con 1 h justa), no con 1 h y 1 s', () => {
    expect(countdownOf(W41, W41.submitEndsAt - 3_599_000)).toMatchObject({
      remainingMs: 3_599_000,
      lastHour: true,
    })
    expect(countdownOf(W41, W41.submitEndsAt - LAST_HOUR_MS)?.lastHour).toBe(true)
    expect(countdownOf(W41, W41.submitEndsAt - 3_601_000)?.lastHour).toBe(false)
    // Las 4 h de solo votación: la última es hora loca otra vez.
    expect(countdownOf(W41, W41.voteEndsAt - 1)?.lastHour).toBe(true)
    expect(countdownOf(W41, W41.submitEndsAt)?.lastHour).toBe(false)
  })

  it('RF-DROP-10: lo que falta siempre es positivo y coincide con el objetivo', () => {
    fc.assert(
      fc.property(weeks, fc.integer({ min: -1e9, max: 1e9 }), (week, offset) => {
        const now = week.submitEndsAt + offset
        const countdown = countdownOf(week, now)
        if (countdown === null) return
        expect(countdown.remainingMs).toBeGreaterThan(0)
        expect(countdown.target - now).toBe(countdown.remainingMs)
        expect(countdown.lastHour).toBe(countdown.remainingMs <= LAST_HOUR_MS)
      }),
    )
  })
})
