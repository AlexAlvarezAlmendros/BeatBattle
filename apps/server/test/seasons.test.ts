import { seasonEndsAt } from '@beatbattle/rules'
import { SeasonStandingsSchema } from '@beatbattle/shared'
import { and, eq, sql } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runBatch } from '../src/db/batch'
import { achievementUnlock, entry, producerProfile, seenFlag, xpEvent } from '../src/db/schema'
import { sealingStatements } from '../src/modules/game/sealing'
import { computeSnapshot } from '../src/modules/results/snapshot'
import { sealWeek } from '../src/modules/weeks/seal'
import { type SimSeason, simSeason } from './fixtures/season'
import { json } from './fixtures/weeks'

// Cada prueba sella varias semanas con el tick: en la CI pasa de los 5 s.
vi.setConfig({ testTimeout: 60_000 })

/**
 * Temporadas (guía §2.9, §4.10; tarea 7.11, hueco G7): el cierre de la temporada con su campeón (`season_champ` y la
 * ceremonia pendiente) en el `batch` del sellado o en el primer `tick` tras el fin del trimestre, y la clasificación
 * pública con solo semanas selladas.
 */

let s: SimSeason
afterEach(async () => {
  await s?.t.app.close()
})

const unlocksOf = async (userId: string) =>
  (
    await s.t.db
      .select({ id: achievementUnlock.achievementId })
      .from(achievementUnlock)
      .where(eq(achievementUnlock.userId, userId))
  )
    .map((row) => row.id)
    .sort()
const champXp = (userId: string) =>
  s.t.db
    .select({ amount: xpEvent.amount, weekId: xpEvent.weekId })
    .from(xpEvent)
    .where(and(eq(xpEvent.userId, userId), eq(xpEvent.kind, 'achievement'), eq(xpEvent.ref, 'season_champ')))
const ledgerSum = async (userId: string) =>
  Number(
    (
      await s.t.db
        .select({ n: sql<number>`coalesce(sum(${xpEvent.amount}), 0)` })
        .from(xpEvent)
        .where(eq(xpEvent.userId, userId))
    )[0]?.n,
  )
const cachedXp = async (userId: string) =>
  (
    await s.t.db
      .select({ xp: producerProfile.xp })
      .from(producerProfile)
      .where(eq(producerProfile.userId, userId))
  )[0]?.xp
const standings = (id = '2026-T4') => s.t.app.inject({ method: 'GET', url: `/api/seasons/${id}/standings` })
const allLedger = () => s.t.db.select().from(xpEvent).orderBy(xpEvent.id)

/** A gana las 7 primeras y B las demás; C, siempre 3.º. */
const aThenB = (week: number, producer: number): number[] => {
  const first = week < 7 ? 0 : 1
  if (producer === first) return [5, 5, 5]
  if (producer === 2) return [3, 3, 3]
  return [4, 4, 4]
}

describe('el cierre de la temporada (7.11, §2.9, hueco G7)', () => {
  it('RF-ARC-05: una temporada de 13 semanas simuladas proclama campeón al sellar la última, con su logro, una vez', async () => {
    s = await simSeason({ count: 13, stars: aThenB })
    const [a, b, c] = s.producers as [
      SimSeason['producers'][0],
      SimSeason['producers'][0],
      SimSeason['producers'][0],
    ]
    for (const w of s.weeks.slice(0, 12)) expect((await s.tick(w.voteEndsAt)).sealed).toEqual([w.slug])
    // Con 12 selladas aún no ha acabado: ni campeón ni temporada cerrada.
    expect(await unlocksOf(a.id)).not.toContain('season_champ')
    expect((await standings()).json().data.season).toEqual({ id: '2026-T4', sealedWeeks: 12, closed: false })

    // La del último lunes (28 de diciembre) cierra el 4 de enero: su sellado (perezoso, sin tick) cierra la temporada
    // en el mismo `batch`.
    const last = s.weeks[12] as SimSeason['weeks'][0]
    expect(await sealWeek(s.t.db, { weekId: last.id, now: last.voteEndsAt, holder: 'lectura' })).toBe(true)
    expect(await unlocksOf(a.id)).toContain('season_champ')
    // El tick siguiente la ve cerrada, y no escribe nada más.
    const ledgerAtSeal = await allLedger()
    expect((await s.tick(last.voteEndsAt + 60_000)).closedSeasons).toEqual(['2026-T4'])
    expect(await allLedger()).toEqual(ledgerAtSeal)
    expect(await champXp(a.id)).toEqual([{ amount: 300, weekId: last.id }])
    expect(await cachedXp(a.id)).toBe(await ledgerSum(a.id))
    for (const other of [b, c]) expect(await unlocksOf(other.id)).not.toContain('season_champ')
    // La ceremonia queda pendiente: nadie la ha marcado vista.
    expect(await s.t.db.select().from(seenFlag).where(eq(seenFlag.kind, 'season_champion'))).toEqual([])

    const table = SeasonStandingsSchema.parse((await standings()).json().data)
    expect(table.season).toEqual({ id: '2026-T4', sealedWeeks: 13, closed: true })
    expect(
      table.rows.map((row) => [
        row.producer?.username,
        row.position,
        row.points,
        row.wins,
        row.podiums,
        row.weeks,
      ]),
    ).toEqual([
      ['prod0', 1, 7 * 25 + 6 * 18, 7, 13, 13],
      ['prod1', 2, 6 * 25 + 7 * 18, 6, 13, 13],
      ['prod2', 3, 13 * 15, 0, 13, 13],
    ])

    // Una vez: otro tick, más tarde, y la capa de juego del sellado otra vez no cambian nada.
    const before = await allLedger()
    expect((await s.tick(last.voteEndsAt + 86_400_000)).closedSeasons).toEqual([])
    let n = 0
    await runBatch(
      s.t.db,
      await sealingStatements(s.t.db, {
        weekId: last.id,
        revision: 1,
        snapshot: await computeSnapshot(s.t.db, last.id),
        now: last.voteEndsAt + 2 * 86_400_000,
        newId: () => `otra-${++n}`,
      }),
    )
    expect(await allLedger()).toEqual(before)
  })

  it('G7: sin semana el último lunes, la cierra el primer tick tras el fin del trimestre (y solo una vez)', async () => {
    s = await simSeason({ count: 12, stars: aThenB }) // del 5 de octubre al 21 de diciembre
    const a = s.producers[0] as SimSeason['producers'][0]
    for (const w of s.weeks) await s.tick(w.voteEndsAt)
    const end = seasonEndsAt('2026-T4')
    expect((await s.tick(end - 1)).closedSeasons).toEqual([])
    expect(await unlocksOf(a.id)).not.toContain('season_champ')
    expect((await standings()).json().data.season.closed).toBe(false)

    expect((await s.tick(end)).closedSeasons).toEqual(['2026-T4'])
    expect(await champXp(a.id)).toEqual([{ amount: 300, weekId: (s.weeks[11] as SimSeason['weeks'][0]).id }])
    expect(await cachedXp(a.id)).toBe(await ledgerSum(a.id))
    expect((await standings()).json().data.season).toEqual({ id: '2026-T4', sealedWeeks: 12, closed: true })
    const before = await allLedger()
    expect((await s.tick(end + 15 * 60_000)).closedSeasons).toEqual([])
    expect(await allLedger()).toEqual(before)
  })

  it('RF-ARC-03, RF-ARC-05: con todo empatado, campeones ex aequo: los dos ganan season_champ', async () => {
    // Dos semanas, una de cada uno, simétricas: mismos puntos, victorias, podios y media.
    s = await simSeason({
      first: { year: 2026, month: 12, day: 14 },
      count: 2,
      producers: 2,
      stars: (w, p) => (w === p ? [5, 5, 5] : [4, 4, 4]),
    })
    const [a, b] = s.producers as [SimSeason['producers'][0], SimSeason['producers'][0]]
    for (const w of s.weeks) await s.tick(w.voteEndsAt)
    await s.tick(seasonEndsAt('2026-T4'))
    expect(await unlocksOf(a.id)).toContain('season_champ')
    expect(await unlocksOf(b.id)).toContain('season_champ')
    const rows = (await standings()).json().data.rows
    expect(rows.map((row: { position: number }) => row.position)).toEqual([1, 1])
  })

  it('§2.8, RF-ARC-05: re-sellar una semana de una temporada cerrada cambia el campeón: el nuevo gana season_champ y el anterior lo pierde con su XP', async () => {
    s = await simSeason({
      first: { year: 2026, month: 12, day: 14 },
      count: 2,
      producers: 2,
      stars: (_, p) => (p === 0 ? [5, 5, 5] : [4, 4, 4]),
    })
    const [a, b] = s.producers as [SimSeason['producers'][0], SimSeason['producers'][0]]
    for (const w of s.weeks) await s.tick(w.voteEndsAt)
    await s.tick(seasonEndsAt('2026-T4') + 1)
    expect(await unlocksOf(a.id)).toContain('season_champ')

    // Re-sellar sin cambios no cambia nada.
    const before = await allLedger()
    const reseal = (slug: string) =>
      s.t.app.inject({
        method: 'POST',
        url: `/api/admin/weeks/${slug}/reseal`,
        headers: { cookie: s.t.admin.cookie, origin: 'http://localhost:5173' },
      })
    expect((await reseal('2026-w51')).statusCode).toBe(200)
    expect(await allLedger()).toEqual(before)

    // Descalificada su entrada de la segunda semana, A tiene 25 puntos y B 43: B es el campeón.
    const second = s.weeks[1] as SimSeason['weeks'][0]
    const entryOfA = s.entries.get(second.id)?.get(a.id) as string
    const dq = await s.t.app.inject({
      method: 'POST',
      url: `/api/admin/entries/${entryOfA}/disqualify`,
      headers: json(s.t.admin.cookie),
      payload: { reason: 'rights' },
    })
    expect(dq.statusCode).toBe(204)
    expect((await reseal(second.slug)).statusCode).toBe(200)
    expect(await unlocksOf(b.id)).toContain('season_champ')
    expect(await unlocksOf(a.id)).not.toContain('season_champ')
    expect(await champXp(a.id)).toEqual([])
    expect(await champXp(b.id)).toEqual([{ amount: 300, weekId: second.id }])
    for (const p of [a, b]) expect(await cachedXp(p.id)).toBe(await ledgerSum(p.id))
    const rows = (await standings()).json().data.rows
    expect(rows.map((row: { producer: { username: string } }) => row.producer.username)).toEqual([
      'prod1',
      'prod0',
    ])
  })
})

describe('GET /api/seasons/:id/standings (7.11, §2.9, §4.10)', () => {
  it('RF-ARC-03: la temporada en curso es pública y solo cuenta las semanas selladas', async () => {
    s = await simSeason({ count: 3, stars: aThenB })
    const [w1, w2, w3] = s.weeks as [SimSeason['weeks'][0], SimSeason['weeks'][0], SimSeason['weeks'][0]]
    await s.tick(w1.voteEndsAt)
    await s.tick(w2.voteEndsAt)
    // La tercera, en juego (con sus entradas y votos): no cuenta.
    s.t.clock.set(w3.startsAt + 3_600_000)
    const res = await standings()
    expect(res.statusCode).toBe(200)
    const table = SeasonStandingsSchema.parse(res.json().data)
    expect(table.season).toEqual({ id: '2026-T4', sealedWeeks: 2, closed: false })
    expect(table.rows.map((row) => [row.producer?.username, row.points, row.weeks])).toEqual([
      ['prod0', 50, 2],
      ['prod1', 36, 2],
      ['prod2', 30, 2],
    ])
    expect(res.body.includes(w3.slug)).toBe(false)
    expect(table.rows[0]?.meanScoreMilli).toBeGreaterThan(table.rows[1]?.meanScoreMilli as number)
  })

  it('RF-PRF-04: un productor eliminado sigue en la tabla como «Productor eliminado» (producer: null)', async () => {
    s = await simSeason({ count: 1, stars: aThenB })
    const c = s.producers[2] as SimSeason['producers'][0]
    await s.tick((s.weeks[0] as SimSeason['weeks'][0]).voteEndsAt)
    // Lo que deja el borrado de la cuenta en una semana sellada (§4.14).
    await s.t.db
      .update(entry)
      .set({ userId: `deleted:${c.id}` })
      .where(eq(entry.userId, c.id))
    const rows = (await standings()).json().data.rows
    expect(
      rows.map((row: { producer: unknown; position: number }) => [row.position, row.producer === null]),
    ).toEqual([
      [1, false],
      [2, false],
      [3, true],
    ])
  })

  it('404 si la temporada aún no ha empezado o no es una temporada', async () => {
    s = await simSeason({ count: 1, stars: aThenB })
    s.t.clock.set((s.weeks[0] as SimSeason['weeks'][0]).startsAt - 1)
    expect((await standings()).statusCode).toBe(404)
    s.t.clock.set((s.weeks[0] as SimSeason['weeks'][0]).startsAt)
    expect((await standings()).statusCode).toBe(200)
    for (const id of ['2027-T1', '2026-T5', 'temporada', '2026-t4'])
      expect((await standings(id)).statusCode, id).toBe(404)
  })
})
