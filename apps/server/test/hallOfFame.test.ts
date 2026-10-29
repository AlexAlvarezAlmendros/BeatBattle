import { type HallOfFame, HallOfFameSchema } from '@beatbattle/shared'
import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { entry, vote } from '../src/db/schema'
import {
  bestScore,
  longestStreak,
  mostVotesCast,
  mostWins,
  type RecordWeek,
} from '../src/modules/hallOfFame/records'
import { type SimSeason, simSeason } from './fixtures/season'
import { json } from './fixtures/weeks'
import { createAccount } from './helpers'

// Cada prueba sella varias semanas con el tick: en la CI pasa de los 5 s.
vi.setConfig({ testTimeout: 60_000 })

/**
 * El salón de la fama (guía §2.9, §4.10; tarea 7.12, `RF-ARC-02`): ganadores, campeones y récords derivados de los
 * snapshots vigentes, con fixtures: cuatro semanas de la 2026-T4 (del 7 al 28 de diciembre) con tres productores (A, B
 * y C) y dos jurados con cuenta (V y W).
 *
 * | semana | 1.º      | 2.º | 3.º            |
 * |--------|----------|-----|----------------|
 * | 1      | A        | B   | —              |
 * | 2      | A y B (ex aequo) | | C           |
 * | 3      | C        | A   | B sin clasificar |
 * | 4      | B        | A   | C              |
 */

let s: SimSeason
afterEach(async () => {
  await s?.t.app.close()
})

const STARS: (number[] | null)[][] = [
  [[5, 5, 5], [4, 4, 4], null],
  [
    [5, 5, 4],
    [5, 5, 4],
    [3, 3, 3],
  ],
  [[4, 4, 4], [2, 2], Array(12).fill(5)],
  [
    [4, 4, 4],
    [5, 5, 5],
    [3, 3, 3],
  ],
]

type P = SimSeason['producers'][0]

async function fixture() {
  s = await simSeason({
    first: { year: 2026, month: 12, day: 7 },
    count: 4,
    stars: (w, p) => STARS[w]?.[p] ?? null,
  })
  const [a, b, c] = s.producers as [P, P, P]
  const v = await createAccount(s.t, { email: 'v@example.com', username: 'jurado_v' })
  const w = await createAccount(s.t, { email: 'w@example.com', username: 'jurado_w' })
  const entryOf = (week: number, p: P) => s.entries.get(s.weeks[week]?.id as string)?.get(p.id) as string
  // Votos de V y W que no cambian el orden de la tabla de arriba.
  const ballots: [string, number, P, number][] = [
    [v.id, 0, a, 5],
    [v.id, 0, b, 4],
    [v.id, 1, a, 5],
    [v.id, 1, b, 5],
    [v.id, 2, c, 5],
    [v.id, 2, a, 4],
    [v.id, 3, b, 5],
    [v.id, 3, a, 4],
    [v.id, 3, c, 3],
    [w.id, 0, a, 5],
    [w.id, 1, a, 5],
    [w.id, 1, b, 5],
  ]
  for (const [userId, week, p, stars] of ballots) {
    const at = s.weeks[week]?.startsAt as number
    await s.t.db.insert(vote).values({
      userId,
      entryId: entryOf(week, p),
      weekId: s.weeks[week]?.id as string,
      stars,
      createdAt: at,
      updatedAt: at,
    })
  }
  return { a, b, c, v, w, entryOf }
}

const hall = async (): Promise<{ data: HallOfFame; body: string }> => {
  const res = await s.t.app.inject({ method: 'GET', url: '/api/hall-of-fame' })
  expect(res.statusCode).toBe(200)
  return { data: HallOfFameSchema.parse(res.json().data), body: res.body }
}

describe('GET /api/hall-of-fame (7.12, §2.9)', () => {
  it('RF-ARC-02: ganadores, campeones y récords derivados de los snapshots; nada de la semana sin sellar', async () => {
    const { a, b, c, entryOf } = await fixture()
    const [w1, w2, w3, w4] = s.weeks as [
      SimSeason['weeks'][0],
      SimSeason['weeks'][0],
      SimSeason['weeks'][0],
      SimSeason['weeks'][0],
    ]
    for (const week of [w1, w2, w3]) await s.tick(week.voteEndsAt)
    // La cuarta, en pleno voto ciego.
    s.t.clock.set(w4.startsAt + 3_600_000)
    const { data, body } = await hall()
    expect(data.weeklyWinners.map((row) => [row.weekNumber, row.producer?.username, row.entryId])).toEqual([
      [3, 'prod2', entryOf(2, c)],
      [2, 'prod0', entryOf(1, a)],
      [2, 'prod1', entryOf(1, b)],
      [1, 'prod0', entryOf(0, a)],
    ])
    expect(data.weeklyWinners[0]).toMatchObject({
      weekSlug: w3.slug,
      alias: expect.any(String),
      cover: { kind: 'generative' },
    })
    // La temporada sigue abierta (le queda la semana del último lunes): sin campeones.
    expect(data.seasonChampions).toEqual([])
    expect(data.records.mostWins).toEqual({
      producer: expect.objectContaining({ username: 'prod0' }),
      value: 2,
    })
    expect(data.records.longestStreak).toEqual({
      producer: expect.objectContaining({ username: 'prod0' }),
      value: 3,
    })
    expect(data.records.bestScore).toMatchObject({
      producer: { username: 'prod2' },
      weekSlug: w3.slug,
      entryId: entryOf(2, c),
    })
    expect(data.records.mostVotesCast).toEqual({
      producer: expect.objectContaining({ username: 'jurado_v' }),
      value: 6,
    })
    // Nada de la cuarta: ni su slug, ni sus entradas, ni los votos de V en ella.
    expect(body.includes(w4.slug)).toBe(false)
    for (const p of [a, b, c]) expect(body.includes(entryOf(3, p))).toBe(false)

    // Sellada la cuarta (la del último lunes), la temporada se cierra: A campeón; B empata a victorias con A, pero A
    // llegó antes a las dos; la racha de A sube a 4 y V suma sus votos de la cuarta.
    await s.tick(w4.voteEndsAt)
    const after = (await hall()).data
    expect(after.weeklyWinners[0]).toMatchObject({ weekNumber: 4, producer: { username: 'prod1' } })
    expect(after.seasonChampions).toEqual([
      { seasonId: '2026-T4', producers: [expect.objectContaining({ username: 'prod0' })] },
    ])
    expect(after.records.mostWins).toMatchObject({ producer: { username: 'prod0' }, value: 2 })
    expect(after.records.longestStreak).toMatchObject({ producer: { username: 'prod0' }, value: 4 })
    expect(after.records.mostVotesCast).toMatchObject({ producer: { username: 'jurado_v' }, value: 9 })

    // Con la cuenta de C borrada (§4.14: sus entradas selladas pasan a `deleted:<id>`), su victoria y su récord siguen,
    // como «Productor eliminado».
    await s.t.db
      .update(entry)
      .set({ userId: `deleted:${c.id}` })
      .where(eq(entry.userId, c.id))
    const deleted = (await hall()).data
    expect(deleted.weeklyWinners.find((row) => row.weekNumber === 3)).toMatchObject({
      entryId: entryOf(2, c),
      producer: null,
    })
    expect(deleted.records.bestScore).toMatchObject({ entryId: entryOf(2, c), producer: null })
  })

  it('RF-ARC-02: tras un re-sellado, todo sale de la revisión vigente', async () => {
    const { a, c, entryOf } = await fixture()
    for (const week of s.weeks) await s.tick(week.voteEndsAt)
    const w3 = s.weeks[2] as SimSeason['weeks'][0]
    const dq = await s.t.app.inject({
      method: 'POST',
      url: `/api/admin/entries/${entryOf(2, c)}/disqualify`,
      headers: json(s.t.admin.cookie),
      payload: { reason: 'rights' },
    })
    expect(dq.statusCode).toBe(204)
    const reseal = await s.t.app.inject({
      method: 'POST',
      url: `/api/admin/weeks/${w3.slug}/reseal`,
      headers: { cookie: s.t.admin.cookie, origin: 'http://localhost:5173' },
    })
    expect(reseal.statusCode).toBe(200)
    const { data } = await hall()
    expect(data.weeklyWinners.find((row) => row.weekNumber === 3)).toMatchObject({
      entryId: entryOf(2, a),
      producer: { username: 'prod0' },
    })
    expect(data.records.mostWins).toMatchObject({ producer: { username: 'prod0' }, value: 3 })
    expect(data.records.bestScore?.entryId).not.toBe(entryOf(2, c))
    // El voto de V a la entrada descalificada ya no cuenta.
    expect(data.records.mostVotesCast).toMatchObject({ producer: { username: 'jurado_v' }, value: 8 })
  })

  it('RF-ARC-02: sin semanas selladas, vacío', async () => {
    s = await simSeason({ count: 1, stars: () => [5, 5, 5] })
    s.t.clock.set((s.weeks[0] as SimSeason['weeks'][0]).startsAt + 1)
    const { data } = await hall()
    expect(data).toEqual({
      weeklyWinners: [],
      seasonChampions: [],
      records: { mostWins: null, longestStreak: null, bestScore: null, mostVotesCast: null },
    })
  })
})

describe('los récords (7.12, §2.9)', () => {
  const wk = (
    number: number,
    rows: [string, number | null, number][],
    votes: [string, number][] = [],
  ): RecordWeek => ({
    id: `w${number}`,
    number,
    seasonId: '2026-T4',
    rows: rows.map(([userId, position, scoreMilli]) => ({
      userId,
      entryId: `e-${number}-${userId}`,
      position,
      scoreMilli,
    })),
    votesByVoter: new Map(votes),
  })

  it('RF-ARC-02: con la misma cifra, el récord es de quien llegó antes (y el orden de las semanas no importa)', () => {
    const weeks = [
      wk(
        3,
        [
          ['b', 1, 4000],
          ['a', 2, 3900],
        ],
        [['z', 3]],
      ),
      wk(
        1,
        [
          ['b', 1, 4500],
          ['a', 2, 4100],
        ],
        [['y', 2]],
      ),
      wk(
        2,
        [
          ['a', 1, 4500],
          ['b', 2, 4000],
        ],
        [
          ['y', 2],
          ['z', 1],
        ],
      ),
    ]
    // b gana la 1 y la 3; a, la 2: b tiene 2.
    expect(mostWins(weeks)).toEqual({ userId: 'b', value: 2, reachedAt: 3 })
    // Los dos clasifican las tres: racha 3, alcanzada a la vez; el id menor.
    expect(longestStreak(weeks)).toEqual({ userId: 'a', value: 3, reachedAt: 3 })
    // 4500 en la 1 (b) y en la 2 (a): la de antes.
    expect(bestScore(weeks)).toEqual({ userId: 'b', scoreMilli: 4500, weekId: 'w1', entryId: 'e-1-b' })
    // y llega a 4 en la 2; z, en la 3.
    expect(mostVotesCast(weeks)).toEqual({ userId: 'y', value: 4, reachedAt: 2 })
  })

  it('RF-ARC-02: la racha usa el comodín de la temporada; las sin clasificar no son mejor puntuación', () => {
    const weeks = [
      wk(1, [['a', 1, 4000]]),
      wk(2, [['a', 1, 4000]]),
      wk(3, [['a', null, 4900]]), // falla: gasta el comodín, la racha se queda en 2
      wk(4, [['a', 1, 4000]]),
    ]
    expect(longestStreak(weeks)).toMatchObject({ userId: 'a', value: 3 })
    expect(bestScore(weeks)?.scoreMilli).toBe(4000)
    expect(mostWins([])).toBeNull()
  })
})
