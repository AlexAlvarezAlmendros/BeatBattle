import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { SealedEntry } from '../src/achievements'
import { replaySealedWeeks, type SealedWeekFacts } from '../src/replay'
import { STREAK_START, streakInPlay, streakOf, xpFor } from '../src/xp'

/** Una entrada sellada: posición (o sin clasificar) con 5 votos de 4. */
const at = (position: number | null, extra: Partial<SealedEntry> = {}): SealedEntry => ({
  position,
  votes: 5,
  starsSum: 20,
  challengeClaimed: false,
  ...extra,
})

/** Semanas 1, 2, 3… de la temporada 2026-T1, con 10 clasificadas cada una. */
function weeks(
  entries: readonly (SealedEntry | null)[],
  extra: Partial<SealedWeekFacts>[] = [],
): SealedWeekFacts[] {
  return entries.map((entry, i) => ({
    weekId: `w${i + 1}`,
    number: i + 1,
    seasonId: '2026-T1',
    golden: false,
    qualifiedEntries: 10,
    entry,
    goldenEar: false,
    ...extra[i],
  }))
}

describe('lo que da el sellado, re-jugado (7.10, §2.8, §2.10)', () => {
  it('RF-GAME-04: la racha del escenario de aceptación, y el XP de resultado con la racha en juego de cada semana', () => {
    const out = replaySealedWeeks(weeks([at(12), at(12), at(12), at(12), null, at(null), at(12)]))
    expect(out.map((w) => w.streak.current)).toEqual([1, 2, 3, 4, 4, 0, 1])
    expect(out[4]?.streak.jokerSeason).toBe('2026-T1')
    // Clasificar (25) × racha en juego 1, 2, 3, 4: 25, 28 (27,5 → 28), 30, 33 (32,5 → 33); sin entrada, 0; sin
    // clasificar, 0; y otra vez desde 1: 25.
    expect(out.map((w) => w.resultXp)).toEqual([25, 28, 30, 33, 0, 0, 25])
    expect(out.at(-1)?.streak).toEqual(
      streakOf(
        out.map((w, i) => ({
          number: w.number,
          seasonId: '2026-T1',
          qualified: [0, 1, 2, 3, 6].includes(i),
        })),
      ),
    )
  })

  it('§2.10: el resultado se paga con la misma racha en juego que subir: la de antes, más esta', () => {
    const [first, second] = replaySealedWeeks(weeks([at(1), at(1)]))
    expect(first?.resultXp).toBe(
      xpFor({ kind: 'result', position: 1 }, { goldenWeek: false, streakWeeks: 1 }),
    )
    expect(second?.resultXp).toBe(
      xpFor(
        { kind: 'result', position: 1 },
        { goldenWeek: false, streakWeeks: streakInPlay(first?.streak ?? STREAK_START) },
      ),
    )
    expect(second?.resultXp).toBe(550)
  })

  it('Anexo B: la semana dorada duplica el resultado y el oído de oro', () => {
    const [plain] = replaySealedWeeks(weeks([at(2)], [{ goldenEar: true }]))
    const [golden] = replaySealedWeeks(weeks([at(2)], [{ goldenEar: true, golden: true }]))
    expect([plain?.resultXp, plain?.goldenEarXp]).toEqual([350, 75])
    expect([golden?.resultXp, golden?.goldenEarXp]).toEqual([700, 150])
  })

  it('RF-GAME-05: podium y win en su semana; win_3 con la tercera victoria; double con dos seguidas; streak_3 desde la tercera', () => {
    const out = replaySealedWeeks(weeks([at(3), at(1), at(5), at(1), at(1)]))
    expect(out.map((w) => w.achievements)).toEqual([
      ['podium'],
      ['podium', 'win'],
      ['streak_3'],
      ['streak_3', 'podium', 'win'],
      ['streak_3', 'podium', 'win', 'win_3', 'double'],
    ])
  })

  it('RF-GAME-05: comeback de la mitad baja al top 3 en semanas consecutivas; streak_3 con la tercera clasificada', () => {
    const out = replaySealedWeeks(weeks([at(8), at(2), at(9)], [{ qualifiedEntries: 10 }, {}, {}]))
    expect(out[1]?.achievements).toEqual(['podium', 'comeback'])
    expect(out[2]?.achievements).toEqual(['streak_3'])
  })

  it('RF-GAME-05: golden_ear con el oído de oro y oracle con tres de número consecutivo', () => {
    const ears = [{ goldenEar: true }, { goldenEar: true }, { goldenEar: true }, { goldenEar: false }]
    const out = replaySealedWeeks(weeks([null, null, null, null], ears))
    expect(out.map((w) => w.achievements)).toEqual([
      ['golden_ear'],
      ['golden_ear'],
      ['golden_ear', 'oracle'],
      [],
    ])
    expect(out.map((w) => w.goldenEarXp)).toEqual([75, 75, 75, 0])
  })

  it('RF-GAME-05: unanimous y challenge se cumplen en la semana de la entrada', () => {
    const [week] = replaySealedWeeks(weeks([at(7, { votes: 10, starsSum: 48, challengeClaimed: true })]))
    expect(week?.achievements).toEqual(['challenge', 'unanimous'])
  })

  it('§2.10: una semana aún sin sellar en medio no rompe la racha ni cuenta como seguida para double u oracle', () => {
    const facts = weeks([at(1), at(1)], [{}, { number: 3, weekId: 'w3' }])
    const out = replaySealedWeeks(facts)
    expect(out.map((w) => w.streak.current)).toEqual([1, 2])
    expect(out[1]?.achievements).toEqual(['podium', 'win'])
  })

  it('las semanas van en orden de número', () => {
    expect(() => replaySealedWeeks(weeks([at(1), at(2)], [{ number: 2 }, { number: 1 }]))).toThrow(RangeError)
  })

  it('propiedades: determinista y por prefijos: re-jugar las k primeras da lo mismo que las k primeras de todo', () => {
    const entry = fc.option(
      fc.record({
        position: fc.option(fc.integer({ min: 1, max: 12 }), { nil: null }),
        votes: fc.integer({ min: 3, max: 15 }),
        starsSum: fc.integer({ min: 3, max: 15 }),
        challengeClaimed: fc.boolean(),
      }),
      { nil: null },
    )
    const facts = fc.array(fc.record({ entry, goldenEar: fc.boolean(), golden: fc.boolean() }), {
      maxLength: 30,
    })
    fc.assert(
      fc.property(facts, fc.nat(30), (list, cut) => {
        const all = weeks(
          list.map((w) => w.entry),
          list.map(({ goldenEar, golden }) => ({ goldenEar, golden })),
        )
        const full = replaySealedWeeks(all)
        expect(replaySealedWeeks(all)).toEqual(full)
        expect(replaySealedWeeks(all.slice(0, cut))).toEqual(full.slice(0, cut))
        for (const week of full) {
          expect(Number.isSafeInteger(week.resultXp) && week.resultXp >= 0).toBe(true)
          expect(week.streak.current).toBeLessThanOrEqual(week.streak.best)
        }
      }),
    )
  })
})
