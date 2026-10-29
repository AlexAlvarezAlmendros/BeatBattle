import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { SealedEntry } from '../src/achievements'
import { XP_VOTE_MAX_VOTES_PER_WEEK } from '../src/balance'
import { zonedInstant } from '../src/calendar'
import {
  type AccountHistory,
  type HistorySealedWeek,
  type HistoryVote,
  type HistoryWeek,
  replayAccount,
  replaySealedWeeks,
} from '../src/replay'
import { xpFor } from '../src/xp'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const WEEK = 7 * DAY
/** Lunes 5 de octubre de 2026, 12:00 en Madrid: el principio de la semana 1. */
const BASE = Date.UTC(2026, 9, 5, 10)
/** El principio de la semana `n`. */
const startOf = (n: number) => BASE + (n - 1) * WEEK

/** La semana `n` (1, 2, 3…) de la 2026-T4, con el cierre de envíos el viernes. */
const week = (n: number, extra: Partial<HistoryWeek> = {}): HistoryWeek => ({
  weekId: `w${n}`,
  number: n,
  seasonId: '2026-T4',
  golden: false,
  submitEndsAt: startOf(n) + 4 * DAY,
  ...extra,
})

/** La semana `n` sellada el lunes siguiente, con 10 clasificadas y la entrada dada. */
const sealed = (
  n: number,
  entry: SealedEntry | null,
  extra: Partial<HistorySealedWeek> = {},
): HistorySealedWeek => ({
  weekId: `w${n}`,
  number: n,
  seasonId: '2026-T4',
  golden: false,
  qualifiedEntries: 10,
  entry,
  goldenEar: false,
  sealedAt: startOf(n + 1),
  ...extra,
})

const at = (position: number | null, extra: Partial<SealedEntry> = {}): SealedEntry => ({
  position,
  votes: 5,
  starsSum: 20,
  challengeClaimed: false,
  ...extra,
})

const history = (extra: Partial<AccountHistory> = {}): AccountHistory => ({
  weeks: [1, 2, 3, 4, 5, 6].map((n) => week(n)),
  downloads: [],
  entries: [],
  votes: [],
  votable: {},
  sealed: [],
  championships: [],
  profile: null,
  ...extra,
})

/** `count` votos a entradas distintas de la semana `n`, uno por minuto desde `from`. */
const votesIn = (n: number, count: number, from = startOf(n) + HOUR, prefix = `e${n}-`): HistoryVote[] =>
  Array.from({ length: count }, (_, i) => ({
    entryId: `${prefix}${i}`,
    weekId: `w${n}`,
    at: from + i * 60_000,
  }))

const brief = (out: ReturnType<typeof replayAccount>) => ({
  movements: out.movements.map((m) => `${m.kind}:${m.ref}:${m.amount}`),
  achievements: out.achievements.map((a) => `${a.id}:${a.ref}`),
})

describe('la historia de una cuenta, re-jugada (7.16, §2.10, §4.11)', () => {
  it('RF-GAME-01: da el libro que habría escrito la capa de juego en vivo, con el instante de cada hecho', () => {
    const e1 = startOf(1) + 2 * HOUR
    const votes = votesIn(1, 5, startOf(1) + 3 * HOUR)
    const out = replayAccount(
      history({
        downloads: [{ weekId: 'w1', at: startOf(1) + HOUR }],
        entries: [
          { entryId: 'mine1', weekId: 'w1', at: e1, firstOfWeek: true },
          { entryId: 'mine2', weekId: 'w2', at: startOf(2) + HOUR, firstOfWeek: false },
          { entryId: 'mine3', weekId: 'w3', at: startOf(3) + HOUR, firstOfWeek: false },
        ],
        votes,
        votable: { w1: votes.map((v) => v.entryId) },
        sealed: [sealed(1, at(1)), sealed(2, at(2))],
        profile: { hasAvatar: true, hasBio: true, links: 1, at: startOf(1) - DAY },
      }),
    )
    expect(brief(out)).toEqual({
      movements: [
        // Subir con la racha en juego 1, y la primera entrada de la semana.
        'entry:w1:100',
        'first_entry_of_week:w1:25',
        ...votes.map((v) => `vote:${v.entryId}:5`),
        'jury_complete:w1:50',
        // 1.º con la racha en juego 1: 500; subir la 2 con la racha en juego 2: +10 %.
        'result:w1:500',
        'entry:w2:110',
        // 2.º con la racha en juego 2: 385; subir la 3 con la racha en juego 3: +20 %.
        'result:w2:385',
        'entry:w3:120',
      ],
      achievements: [
        'profile_done:null',
        'first_drop:w1',
        'first_entry:mine1',
        'early_bird:mine1',
        `first_vote:${votes[0]?.entryId}`,
        `jury_full:${votes[4]?.entryId}`,
        'podium:w1',
        'win:w1',
      ],
    })
    // Cada movimiento y cada logro llevan el instante de su hecho.
    expect(out.movements[0]?.at).toBe(e1)
    expect(out.movements.find((m) => m.kind === 'jury_complete')?.at).toBe(votes[4]?.at)
    expect(out.movements.find((m) => m.kind === 'result')?.at).toBe(startOf(2))
    expect(out.achievements.find((a) => a.id === 'win')).toEqual({
      id: 'win',
      ref: 'w1',
      weekId: 'w1',
      at: startOf(2),
    })
    expect(out.achievements[0]).toEqual({ id: 'profile_done', ref: null, weekId: null, at: startOf(1) - DAY })
    expect(out.streak).toEqual({ current: 2, best: 2, lastWeekNumber: 2, jokerSeason: null })
  })

  it('RF-GAME-03: 45 votos en una semana dan 40 movimientos de 5 XP, contados en orden de calendario; en la dorada, de 10', () => {
    const votes = votesIn(1, 45)
    // En desorden: el tope cuenta los 40 primeros por su instante.
    const out = replayAccount(history({ votes: [...votes].reverse() }))
    const paid = out.movements.filter((m) => m.kind === 'vote')
    expect(paid).toHaveLength(XP_VOTE_MAX_VOTES_PER_WEEK)
    expect(paid.map((m) => m.ref)).toEqual(votes.slice(0, 40).map((v) => v.entryId))
    expect(paid.reduce((sum, m) => sum + m.amount, 0)).toBe(200)
    const golden = replayAccount(history({ weeks: [week(1, { golden: true })], votes }))
    expect(golden.movements.filter((m) => m.kind === 'vote').every((m) => m.amount === 10)).toBe(true)
    // Otra semana, otro tope; y un segundo voto a la misma entrada no cuenta.
    const two = replayAccount(
      history({ votes: [...votes, ...votesIn(2, 3), { ...votes[0], at: BASE } as HistoryVote] }),
    )
    expect(two.movements.filter((m) => m.kind === 'vote')).toHaveLength(43)
    expect(two.achievements.filter((a) => a.id === 'first_vote')).toHaveLength(1)
  })

  it('RF-GAME-05: el jurado completo pide votar todas las entradas activas ajenas de la semana, 5 o más; con 4, no', () => {
    const five = votesIn(1, 5)
    const full = replayAccount(history({ votes: five, votable: { w1: five.map((v) => v.entryId) } }))
    expect(full.movements.filter((m) => m.kind === 'jury_complete')).toEqual([
      { kind: 'jury_complete', ref: 'w1', weekId: 'w1', amount: 50, at: five[4]?.at },
    ])
    expect(full.achievements.map((a) => a.id)).toContain('jury_full')
    // Con una entrada ajena sin votar, no.
    const missing = replayAccount(
      history({ votes: five, votable: { w1: [...five.map((v) => v.entryId), 'otra'] } }),
    )
    expect(missing.movements.some((m) => m.kind === 'jury_complete')).toBe(false)
    // Con 4 entradas ajenas votadas todas, tampoco.
    const four = votesIn(1, 4)
    const small = replayAccount(history({ votes: four, votable: { w1: four.map((v) => v.entryId) } }))
    expect(small.movements.some((m) => m.kind === 'jury_complete')).toBe(false)
    expect(small.achievements.map((a) => a.id)).not.toContain('jury_full')
  })

  it('RF-GAME-05: entries_10 con la décima semana con entrada, last_minute, golden_week y una segunda entrada de la misma semana no paga otra vez', () => {
    const weeks = Array.from({ length: 10 }, (_, i) => week(i + 1, { golden: i === 3 }))
    const entries = weeks.map((w, i) => ({
      entryId: `x${i + 1}`,
      weekId: w.weekId,
      // La 5.ª, nueve minutos antes del cierre de envíos (dentro de los 10 de `last_minute`).
      at: i === 4 ? w.submitEndsAt - 9 * 60_000 : startOf(i + 1) + HOUR,
      firstOfWeek: false,
    }))
    const again = { entryId: 'x1-bis', weekId: 'w1', at: startOf(1) + 2 * HOUR, firstOfWeek: false }
    const out = replayAccount(history({ weeks, entries: [...entries, again] }))
    expect(out.movements.filter((m) => m.kind === 'entry')).toHaveLength(10)
    // La dorada duplica subir.
    expect(out.movements.find((m) => m.ref === 'w4')?.amount).toBe(200)
    expect(out.achievements.map((a) => `${a.id}:${a.ref}`)).toEqual([
      'first_entry:x1',
      'golden_week:x4',
      'last_minute:x5',
      'entries_10:x10',
    ])
  })

  it('RF-GAME-05: night_owl con el décimo voto a entradas distintas de una misma noche (03:00–05:00 en Madrid)', () => {
    const night = (day: number, hour: number, minute: number) =>
      zonedInstant({ year: 2026, month: 10, day }, { hour, minute, second: 0 })
    const votes: HistoryVote[] = [
      // Nueve la noche del martes 6 y el décimo, a las 05:00 justas (fuera).
      ...Array.from({ length: 9 }, (_, i) => ({ entryId: `a${i}`, weekId: 'w1', at: night(6, 3, i * 5) })),
      { entryId: 'a9', weekId: 'w1', at: night(6, 5, 0) },
      // Diez la noche del miércoles 7: el décimo lo da.
      ...Array.from({ length: 10 }, (_, i) => ({ entryId: `b${i}`, weekId: 'w1', at: night(7, 4, i * 3) })),
    ]
    const out = replayAccount(history({ votes }))
    expect(out.achievements.find((a) => a.id === 'night_owl')).toEqual({
      id: 'night_owl',
      ref: 'b9',
      weekId: 'w1',
      at: night(7, 4, 27),
    })
  })

  it('RF-GAME-04: subir paga con la racha en juego de las semanas selladas anteriores; la salvada por el comodín no suma', () => {
    const out = replayAccount(
      history({
        entries: [{ entryId: 'z', weekId: 'w4', at: startOf(4) + HOUR, firstOfWeek: false }],
        sealed: [sealed(1, at(12)), sealed(2, at(12)), sealed(3, null)],
      }),
    )
    // Racha 2 (la 3 la salva el comodín sin sumar) → en juego 3: +20 %.
    expect(out.movements.find((m) => m.kind === 'entry')?.amount).toBe(120)
    expect(out.streak).toEqual({ current: 2, best: 2, lastWeekNumber: 3, jokerSeason: '2026-T4' })
  })

  it('RF-ARC-05: season_champ al cerrarse la primera temporada que gana, una vez', () => {
    const out = replayAccount(
      history({
        championships: [
          { seasonId: '2027-T1', lastWeekId: 'w6', at: startOf(7) },
          { seasonId: '2026-T4', lastWeekId: 'w3', at: startOf(4) },
        ],
      }),
    )
    expect(out.achievements).toEqual([{ id: 'season_champ', ref: '2026-T4', weekId: 'w3', at: startOf(4) }])
  })

  it('el resultado, el oído de oro, la racha y los logros de resultado son los de replaySealedWeeks', () => {
    const weeks = [
      sealed(1, at(1), { goldenEar: true }),
      sealed(2, at(1), { goldenEar: true, golden: true }),
      sealed(3, at(5), { goldenEar: true }),
      sealed(4, null),
    ]
    const out = replayAccount(history({ sealed: weeks }))
    const replayed = replaySealedWeeks(weeks)
    for (const kind of ['result', 'golden_ear'] as const)
      expect(out.movements.filter((m) => m.kind === kind).map((m) => [m.ref, m.amount])).toEqual(
        replayed
          .map((o) => [o.weekId, kind === 'result' ? o.resultXp : o.goldenEarXp] as const)
          .filter(([, amount]) => amount > 0),
      )
    expect(out.streak).toEqual(replayed.at(-1)?.streak)
    expect(out.achievements.map((a) => `${a.id}:${a.ref}`)).toEqual([
      'podium:w1',
      'win:w1',
      'golden_ear:w1',
      'double:w2',
      'streak_3:w3',
      'oracle:w3',
    ])
  })

  it('una semana que no está en la historia o un instante que no es finito lanzan RangeError', () => {
    expect(() =>
      replayAccount(history({ entries: [{ entryId: 'x', weekId: 'w99', at: BASE, firstOfWeek: false }] })),
    ).toThrow(RangeError)
    expect(() => replayAccount(history({ downloads: [{ weekId: 'w1', at: Number.NaN }] }))).toThrow(
      RangeError,
    )
  })

  it('propiedades: determinista, sin depender del orden de las listas, un movimiento por tipo y referencia, ≤ 40 votos con XP por semana, cada logro una vez y todo en orden de calendario', () => {
    const weekNumber = fc.integer({ min: 1, max: 6 })
    const instantIn = (n: number) => fc.integer({ min: startOf(n), max: startOf(n) + WEEK - 1 })
    const vote = weekNumber.chain((n) =>
      fc.record({
        entryId: fc.integer({ min: 0, max: 60 }).map((i) => `e${n}-${i}`),
        weekId: fc.constant(`w${n}`),
        at: instantIn(n),
      }),
    )
    const entry = weekNumber.chain((n) =>
      fc.record({
        entryId: fc.integer({ min: 0, max: 3 }).map((i) => `mine${n}-${i}`),
        weekId: fc.constant(`w${n}`),
        at: instantIn(n),
        firstOfWeek: fc.boolean(),
      }),
    )
    const sealedWeeks = fc.uniqueArray(weekNumber, { maxLength: 6 }).chain((numbers) =>
      fc.tuple(
        ...[...numbers]
          .sort((a, b) => a - b)
          .map((n) =>
            fc
              .record({
                position: fc.option(fc.integer({ min: 1, max: 12 }), { nil: null }),
                goldenEar: fc.boolean(),
                played: fc.boolean(),
              })
              .map(({ position, goldenEar, played }) =>
                sealed(n, played ? at(position) : null, { goldenEar }),
              ),
          ),
      ),
    )
    const arbitrary = fc.record({
      votes: fc.array(vote, { maxLength: 120 }),
      entries: fc.array(entry, { maxLength: 8 }),
      downloads: fc.array(
        weekNumber.chain((n) => fc.record({ weekId: fc.constant(`w${n}`), at: instantIn(n) })),
        {
          maxLength: 4,
        },
      ),
      sealed: sealedWeeks,
      votable: fc.dictionary(
        weekNumber.map((n) => `w${n}`),
        fc.uniqueArray(fc.integer({ min: 0, max: 8 }), { maxLength: 9 }),
      ),
      seed: fc.integer(),
    })
    fc.assert(
      fc.property(arbitrary, (input) => {
        const votable = Object.fromEntries(
          Object.entries(input.votable).map(([w, list]) => [w, list.map((i) => `e${w.slice(1)}-${i}`)]),
        )
        const base = history({ ...input, votable })
        const out = replayAccount(base)
        expect(replayAccount(base)).toEqual(out)
        // Las listas al revés dan lo mismo.
        expect(
          replayAccount({
            ...base,
            votes: [...base.votes].reverse(),
            entries: [...base.entries].reverse(),
            downloads: [...base.downloads].reverse(),
          }),
        ).toEqual(out)
        const keys = out.movements.map((m) => `${m.kind}:${m.ref}`)
        expect(new Set(keys).size).toBe(keys.length)
        const ids = out.achievements.map((a) => a.id)
        expect(new Set(ids).size).toBe(ids.length)
        for (let n = 1; n <= 6; n++)
          expect(
            out.movements.filter((m) => m.kind === 'vote' && m.weekId === `w${n}`).length,
          ).toBeLessThanOrEqual(XP_VOTE_MAX_VOTES_PER_WEEK)
        for (const m of out.movements) expect(Number.isSafeInteger(m.amount) && m.amount > 0).toBe(true)
        for (let i = 1; i < out.movements.length; i++)
          expect((out.movements[i]?.at ?? 0) >= (out.movements[i - 1]?.at ?? 0)).toBe(true)
        for (let i = 1; i < out.achievements.length; i++)
          expect((out.achievements[i]?.at ?? 0) >= (out.achievements[i - 1]?.at ?? 0)).toBe(true)
        // Subir paga como mucho una vez por semana y nunca por debajo de lo que da sin racha.
        for (const m of out.movements.filter((x) => x.kind === 'entry'))
          expect(m.amount).toBeGreaterThanOrEqual(
            xpFor({ kind: 'entry' }, { goldenWeek: false, streakWeeks: 1 }),
          )
      }),
    )
  })
})
