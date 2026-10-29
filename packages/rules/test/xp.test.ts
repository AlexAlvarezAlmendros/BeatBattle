import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { ACHIEVEMENT_RARITIES, type AchievementRarity } from '../src/balance'
import { isJuryComplete, resultBaseXp, type XpContext, type XpEvent, xpFor } from '../src/xp'

const normal: XpContext = { goldenWeek: false, streakWeeks: 1 }
const golden: XpContext = { goldenWeek: true, streakWeeks: 1 }
const withStreak = (streakWeeks: number, goldenWeek = false): XpContext => ({ goldenWeek, streakWeeks })

const rarity = fc.constantFrom<AchievementRarity>(...ACHIEVEMENT_RARITIES)
const position = fc.option(fc.integer({ min: 1, max: 200 }), { nil: null })
const counter = fc.integer({ min: 0, max: 100 })

/** Cualquier evento del Anexo B, con sus datos. */
const anyEvent: fc.Arbitrary<XpEvent> = fc.oneof(
  fc.constant<XpEvent>({ kind: 'entry' }),
  fc.constant<XpEvent>({ kind: 'firstEntryOfWeek' }),
  fc.record({
    kind: fc.constant('vote' as const),
    firstVoteToEntry: fc.boolean(),
    votesWithXpThisWeek: counter,
  }),
  fc.integer({ min: 0, max: 30 }).chain((votable) =>
    fc.record({
      kind: fc.constant('juryComplete' as const),
      votedEntries: fc.integer({ min: 0, max: votable }),
      votableEntries: fc.constant(votable),
    }),
  ),
  fc.record({ kind: fc.constant('result' as const), position }),
  fc.constant<XpEvent>({ kind: 'goldenEar' }),
  fc.record({
    kind: fc.constant('producerGuess' as const),
    correct: fc.boolean(),
    guessesWithXpThisWeek: counter,
  }),
  fc.record({ kind: fc.constant('achievement' as const), rarity }),
)
const anyContext = fc.record({ goldenWeek: fc.boolean(), streakWeeks: fc.integer({ min: 0, max: 60 }) })

/** Una semana de votos: cada voto a una entrada (con repeticiones), en orden, contando en el libro como el servidor. */
function weekOfVotes(entryIds: readonly number[], context: XpContext): number {
  const voted = new Set<number>()
  let votesWithXp = 0
  let total = 0
  for (const id of entryIds) {
    const xp = xpFor(
      { kind: 'vote', firstVoteToEntry: !voted.has(id), votesWithXpThisWeek: votesWithXp },
      context,
    )
    voted.add(id)
    if (xp > 0) votesWithXp += 1
    total += xp
  }
  return total
}

describe('xpFor: la tabla del Anexo B', () => {
  it('RF-GAME-03: subir da 100, × racha en juego (130 con racha 4)', () => {
    expect(xpFor({ kind: 'entry' }, withStreak(0))).toBe(100)
    expect(xpFor({ kind: 'entry' }, withStreak(1))).toBe(100)
    expect(xpFor({ kind: 'entry' }, withStreak(2))).toBe(110)
    expect(xpFor({ kind: 'entry' }, withStreak(4))).toBe(130)
    expect(xpFor({ kind: 'entry' }, withStreak(6))).toBe(150)
    expect(xpFor({ kind: 'entry' }, withStreak(26))).toBe(150)
  })

  it('RF-GAME-03: la primera entrada de la semana suma 25, sin racha', () => {
    expect(xpFor({ kind: 'firstEntryOfWeek' }, normal)).toBe(25)
    expect(xpFor({ kind: 'firstEntryOfWeek' }, withStreak(6))).toBe(25)
  })

  it('RF-GAME-03: votar da 5 solo el primer voto a cada entrada y hasta 40 votos con XP por semana', () => {
    expect(xpFor({ kind: 'vote', firstVoteToEntry: true, votesWithXpThisWeek: 0 }, normal)).toBe(5)
    expect(xpFor({ kind: 'vote', firstVoteToEntry: true, votesWithXpThisWeek: 39 }, normal)).toBe(5)
    expect(xpFor({ kind: 'vote', firstVoteToEntry: true, votesWithXpThisWeek: 40 }, normal)).toBe(0)
    // Cambiar el voto, o quitarlo y volver a votar, no suma (guía §2.10).
    expect(xpFor({ kind: 'vote', firstVoteToEntry: false, votesWithXpThisWeek: 3 }, normal)).toBe(0)
  })

  it('RF-GAME-03: 50 votos en una semana dan como máximo 40 × 5 XP', () => {
    const fiftyDistinct = Array.from({ length: 50 }, (_, i) => i)
    expect(weekOfVotes(fiftyDistinct, normal)).toBe(40 * 5)
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 60 }), { minLength: 50, maxLength: 50 }), (entryIds) => {
        const total = weekOfVotes(entryIds, normal)
        expect(total).toBeLessThanOrEqual(40 * 5)
        // Exactamente 5 por entrada distinta, hasta el tope.
        expect(total).toBe(5 * Math.min(40, new Set(entryIds).size))
      }),
    )
  })

  it('RF-GAME-03: el tope es de votos, no de XP: en semana dorada, 40 × 10', () => {
    const fiftyDistinct = Array.from({ length: 50 }, (_, i) => i)
    expect(weekOfVotes(fiftyDistinct, golden)).toBe(40 * 10)
  })

  it('RF-GAME-03: jurado completo da 50 al votar todas las entradas ajenas, si son 5 o más', () => {
    expect(xpFor({ kind: 'juryComplete', votedEntries: 5, votableEntries: 5 }, normal)).toBe(50)
    expect(xpFor({ kind: 'juryComplete', votedEntries: 23, votableEntries: 23 }, normal)).toBe(50)
    expect(xpFor({ kind: 'juryComplete', votedEntries: 22, votableEntries: 23 }, normal)).toBe(0)
    expect(xpFor({ kind: 'juryComplete', votedEntries: 4, votableEntries: 4 }, normal)).toBe(0)
    expect(isJuryComplete(0, 0)).toBe(false)
    expect(() => isJuryComplete(6, 5)).toThrow(RangeError)
  })

  it('RF-GAME-03: el resultado da 500 / 350 / 250 / 100 / 25 y sustituye a clasificar', () => {
    expect(
      [1, 2, 3, 4, 10, 11, 57].map((p) => xpFor({ kind: 'result', position: p }, withStreak(1))),
    ).toEqual([500, 350, 250, 100, 100, 25, 25])
    // Sin clasificar no hay XP de resultado.
    expect(xpFor({ kind: 'result', position: null }, withStreak(6))).toBe(0)
    // Ex aequo: comparten posición y XP (1, 1, 3).
    expect([1, 1, 3].map(resultBaseXp)).toEqual([500, 500, 250])
  })

  it('RF-GAME-03: el resultado lleva el bonus de racha, con el redondeo del Anexo G', () => {
    expect(xpFor({ kind: 'result', position: 1 }, withStreak(6))).toBe(750)
    expect(xpFor({ kind: 'result', position: 2 }, withStreak(3))).toBe(420)
    expect(xpFor({ kind: 'result', position: 3 }, withStreak(2))).toBe(275)
    expect(xpFor({ kind: 'result', position: 7 }, withStreak(5))).toBe(140)
    // 25 · 1,1 = 27,5 → 28 y 25 · 1,3 = 32,5 → 33: las mitades, hacia arriba.
    expect(xpFor({ kind: 'result', position: 11 }, withStreak(2))).toBe(28)
    expect(xpFor({ kind: 'result', position: 11 }, withStreak(3))).toBe(30)
    expect(xpFor({ kind: 'result', position: 11 }, withStreak(4))).toBe(33)
    expect(xpFor({ kind: 'result', position: 11 }, withStreak(6))).toBe(38)
  })

  it('RF-GAME-03: oído de oro da 75', () => {
    expect(xpFor({ kind: 'goldenEar' }, normal)).toBe(75)
    expect(xpFor({ kind: 'goldenEar' }, withStreak(6))).toBe(75)
  })

  it('RF-GAME-03: acertar el productor da 15, hasta 5 aciertos por semana (Fase 8)', () => {
    expect(xpFor({ kind: 'producerGuess', correct: true, guessesWithXpThisWeek: 0 }, normal)).toBe(15)
    expect(xpFor({ kind: 'producerGuess', correct: true, guessesWithXpThisWeek: 4 }, normal)).toBe(15)
    expect(xpFor({ kind: 'producerGuess', correct: true, guessesWithXpThisWeek: 5 }, normal)).toBe(0)
    expect(xpFor({ kind: 'producerGuess', correct: false, guessesWithXpThisWeek: 0 }, normal)).toBe(0)
  })

  it('RF-GAME-03: un logro da el XP de su rareza (25 / 75 / 150 / 300), sin racha ni semana dorada', () => {
    const table: Record<AchievementRarity, number> = { common: 25, rare: 75, epic: 150, legendary: 300 }
    for (const r of ACHIEVEMENT_RARITIES) {
      expect(xpFor({ kind: 'achievement', rarity: r }, normal), r).toBe(table[r])
      expect(xpFor({ kind: 'achievement', rarity: r }, withStreak(6, true)), r).toBe(table[r])
    }
  })

  it('RF-GAME-03: la semana dorada duplica el entero ya redondeado (subir con racha 4 → 260; clasificar con racha 2 → 56)', () => {
    expect(xpFor({ kind: 'entry' }, withStreak(4, true))).toBe(260)
    expect(xpFor({ kind: 'result', position: 11 }, withStreak(2, true))).toBe(56)
    expect(xpFor({ kind: 'firstEntryOfWeek' }, golden)).toBe(50)
    expect(xpFor({ kind: 'juryComplete', votedEntries: 5, votableEntries: 5 }, golden)).toBe(100)
    expect(xpFor({ kind: 'goldenEar' }, golden)).toBe(150)
  })
})

describe('xpFor: propiedades', () => {
  it('RF-GAME-03: siempre un entero ≥ 0', () => {
    fc.assert(
      fc.property(anyEvent, anyContext, (event, context) => {
        const xp = xpFor(event, context)
        expect(Number.isSafeInteger(xp)).toBe(true)
        expect(xp).toBeGreaterThanOrEqual(0)
      }),
    )
  })

  it('RF-GAME-03: en semana dorada, × 2 exacto (salvo los logros, que no cambian)', () => {
    fc.assert(
      fc.property(anyEvent, fc.integer({ min: 0, max: 60 }), (event, streakWeeks) => {
        const plain = xpFor(event, { goldenWeek: false, streakWeeks })
        const doubled = xpFor(event, { goldenWeek: true, streakWeeks })
        expect(doubled).toBe(event.kind === 'achievement' ? plain : 2 * plain)
      }),
    )
  })

  it('RF-GAME-03: el resultado sustituye a clasificar: un solo importe de la tabla, nunca la suma', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 500 }), (p) => {
        expect([500, 350, 250, 100, 25]).toContain(resultBaseXp(p))
        expect(xpFor({ kind: 'result', position: p }, withStreak(1))).toBe(resultBaseXp(p))
      }),
    )
  })

  it('RF-GAME-04: la racha solo cambia subir y el resultado, y alargarla nunca da menos (hasta +50 %)', () => {
    fc.assert(
      fc.property(anyEvent, fc.boolean(), fc.nat(40), fc.nat(40), (event, goldenWeek, a, b) => {
        const shorter = xpFor(event, { goldenWeek, streakWeeks: Math.min(a, b) })
        const longer = xpFor(event, { goldenWeek, streakWeeks: Math.max(a, b) })
        if (event.kind === 'entry' || event.kind === 'result') {
          expect(longer).toBeGreaterThanOrEqual(shorter)
          expect(longer).toBeLessThanOrEqual(Math.ceil(shorter * 1.5) + 1)
        } else {
          expect(longer).toBe(shorter)
        }
      }),
    )
  })

  it('rechaza datos imposibles', () => {
    expect(() => xpFor({ kind: 'entry' }, withStreak(-1))).toThrow(RangeError)
    expect(() => xpFor({ kind: 'entry' }, withStreak(1.5))).toThrow(RangeError)
    expect(() => xpFor({ kind: 'result', position: 0 }, normal)).toThrow(RangeError)
    expect(() => xpFor({ kind: 'result', position: 2.5 }, normal)).toThrow(RangeError)
    expect(() => xpFor({ kind: 'vote', firstVoteToEntry: true, votesWithXpThisWeek: -1 }, normal)).toThrow(
      RangeError,
    )
    expect(() =>
      xpFor({ kind: 'producerGuess', correct: true, guessesWithXpThisWeek: Number.NaN }, normal),
    ).toThrow(RangeError)
  })
})
