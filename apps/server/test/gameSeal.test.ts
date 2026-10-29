import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { scheduleWeek as boundaries, LEVEL_MAX, xpForLevel } from '@beatbattle/rules'
import { and, eq, sql } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runBatch } from '../src/db/batch'
import {
  achievementUnlock,
  entry,
  producerProfile,
  result,
  sample,
  streakState,
  vote,
  week,
  xpEvent,
} from '../src/db/schema'
import { sealingStatements } from '../src/modules/game/sealing'
import { computeSnapshot } from '../src/modules/results/snapshot'
import { sealWeek } from '../src/modules/weeks/seal'
import { type Battle, battle, entryValues, W42 } from './fixtures/battle'
import { json } from './fixtures/weeks'

// Cada prueba crea varias cuentas: en la CI pasa de los 5 s.
vi.setConfig({ testTimeout: 30_000 })

/**
 * La capa de juego del sellado y del re-sellado (guía §2.8, §2.10, §4.11; tarea 7.10, hueco G2): el XP de resultado,
 * el oído de oro, la racha y los logros de resultado, en el `batch` del sellado y re-jugados en cada re-sellado.
 */

let b: Battle
afterEach(async () => {
  await b?.t.app.close()
})

let serial = 0
/** Votos directos en la BD (de cuentas sin fila, como los de otras personas, salvo que se diga quién). */
async function votes(entryId: string, stars: number[], weekId = b.weekId, voter?: string) {
  for (const s of stars)
    await b.t.db.insert(vote).values({
      userId: voter ?? `v-${++serial}`,
      entryId,
      weekId,
      stars: s,
      createdAt: W42.startsAt,
      updatedAt: W42.startsAt,
    })
}

const seal = () => sealWeek(b.t.db, { weekId: b.weekId, now: W42.voteEndsAt, holder: 'test' })
const admin = () => b.t.admin
const ledger = (userId: string) =>
  b.t.db.select().from(xpEvent).where(eq(xpEvent.userId, userId)).orderBy(xpEvent.kind, xpEvent.ref)
const allLedger = () => b.t.db.select().from(xpEvent).orderBy(xpEvent.id)
const sumOf = async (userId: string, kind?: 'result' | 'golden_ear', weekId?: string) =>
  Number(
    (
      await b.t.db
        .select({ n: sql<number>`coalesce(sum(${xpEvent.amount}), 0)` })
        .from(xpEvent)
        .where(
          and(
            eq(xpEvent.userId, userId),
            kind ? eq(xpEvent.kind, kind) : undefined,
            weekId ? eq(xpEvent.weekId, weekId) : undefined,
          ),
        )
    )[0]?.n,
  )
const unlocks = async (userId: string) =>
  (
    await b.t.db
      .select({ id: achievementUnlock.achievementId })
      .from(achievementUnlock)
      .where(eq(achievementUnlock.userId, userId))
  )
    .map((row) => row.id)
    .sort()
const cachedXp = async (userId: string) =>
  (
    await b.t.db
      .select({ xp: producerProfile.xp })
      .from(producerProfile)
      .where(eq(producerProfile.userId, userId))
  )[0]?.xp
const results = (cookie?: string) =>
  b.t.app.inject({
    method: 'GET',
    url: '/api/weeks/2026-w42/results',
    ...(cookie ? { headers: { cookie } } : {}),
  })
const disqualify = (entryId: string) =>
  b.t.app.inject({
    method: 'POST',
    url: `/api/admin/entries/${entryId}/disqualify`,
    headers: json(admin().cookie),
    payload: { reason: 'rights' },
  })
const reseal = (slug = '2026-w42') =>
  b.t.app.inject({
    method: 'POST',
    url: `/api/admin/weeks/${slug}/reseal`,
    headers: { cookie: admin().cookie, origin: 'http://localhost:5173' },
  })

/** Cuatro productores con 1.º, 2.º, 3.º y 4.º claros (3 votos cada uno) y uno sin clasificar. */
async function podiumOfFour() {
  b = await battle({ producers: 5, voters: 1 })
  const [p1, p2, p3, p4, p5] = b.producers as [
    Battle['producers'][0],
    Battle['producers'][0],
    Battle['producers'][0],
    Battle['producers'][0],
    Battle['producers'][0],
  ]
  await votes(p1.entryId, [5, 5, 5])
  await votes(p2.entryId, [4, 4, 5])
  await votes(p3.entryId, [4, 4, 4])
  await votes(p4.entryId, [3, 3, 3])
  await votes(p5.entryId, [5, 5]) // dos votos: sin clasificar
  return { p1, p2, p3, p4, p5 }
}

describe('el sellado paga el resultado (7.10, §2.8, Anexo B)', () => {
  it('RF-RES-08 / RF-GAME-05: XP por posición (sin racha previa), podium y win, y «tu resultado» con su XP y sus puntos', async () => {
    const { p1, p2, p3, p4, p5 } = await podiumOfFour()
    expect(await seal()).toBe(true)
    expect(await sumOf(p1.id, 'result')).toBe(500)
    expect(await sumOf(p2.id, 'result')).toBe(350)
    expect(await sumOf(p3.id, 'result')).toBe(250)
    expect(await sumOf(p4.id, 'result')).toBe(100)
    expect(await ledger(p5.id)).toEqual([]) // sin clasificar: 0, sin fila
    expect(await unlocks(p1.id)).toEqual(['podium', 'win'])
    expect(await unlocks(p3.id)).toEqual(['podium'])
    expect(await unlocks(p4.id)).toEqual([])
    // win (150) + podium (75) + 500.
    expect(await cachedXp(p1.id)).toBe(725)
    const mine = (await results(p2.cookie)).json().data
    expect(mine.myGame).toEqual({ xp: 350, goldenEar: false, seasonPoints: 18 })
    expect((await results()).json().data.myGame).toBeNull()
    const voter = b.voters[0] as Battle['voters'][0]
    expect((await results(voter.cookie)).json().data.myGame).toEqual({
      xp: 0,
      goldenEar: false,
      seasonPoints: 0,
    })
    // La racha guardada: una semana clasificada.
    const [streak] = await b.t.db.select().from(streakState).where(eq(streakState.userId, p1.id))
    expect(streak).toMatchObject({ current: 1, best: 1, lastWeekNumber: 1, jokerSeason: null })
  })

  it('RF-GAME-01: re-ejecutar el sellado (otra vez, o su capa de juego entera) no cambia el XP de nadie', async () => {
    await podiumOfFour()
    await seal()
    const before = await allLedger()
    const unlocked = await b.t.db.select().from(achievementUnlock)
    const streaks = await b.t.db.select().from(streakState)
    expect(await seal()).toBe(false)
    for (let i = 0; i < 3; i++) await results()
    // La capa de juego del sellado, calculada y aplicada otra vez sobre la revisión vigente: nada nuevo.
    let n = 0
    const again = await sealingStatements(b.t.db, {
      weekId: b.weekId,
      revision: 1,
      snapshot: await computeSnapshot(b.t.db, b.weekId),
      now: W42.voteEndsAt + 5,
      newId: () => `again-${++n}`,
    })
    await runBatch(b.t.db, again)
    expect(await allLedger()).toEqual(before)
    expect(await b.t.db.select().from(achievementUnlock)).toEqual(unlocked)
    expect(await b.t.db.select().from(streakState)).toEqual(streaks)
  })

  it('RF-GAME-05: challenge con la casilla del reto y el top 10; unanimous con media ≥ 4,8 y 10 votos', async () => {
    b = await battle({ producers: 2, voters: 0 })
    const [a, c] = b.producers as [Battle['producers'][0], Battle['producers'][0]]
    await b.t.db.update(entry).set({ challengeClaimed: true }).where(eq(entry.id, c.entryId))
    await votes(a.entryId, [5, 5, 5, 5, 5, 5, 5, 5, 4, 5])
    await votes(c.entryId, [3, 3, 3])
    await seal()
    expect(await unlocks(a.id)).toEqual(['podium', 'unanimous', 'win'])
    expect(await unlocks(c.id)).toEqual(['challenge', 'podium'])
  })
})

describe('el oído de oro al sellar (7.10, §2.10, Anexo G)', () => {
  /** El caso del Anexo G: 8 entradas, el jurado y otro voto en cada una. */
  async function anexoG(seventh: number) {
    b = await battle({ producers: 8, voters: 1 })
    const juror = b.voters[0] as Battle['voters'][0]
    const mine = [4, 1, 4, 4, 5, 2, seventh, 1]
    const others = [4, 1, 3, 3, 2, 3, 1, 1]
    for (const [i, p] of b.producers.entries()) {
      await votes(p.entryId, [mine[i] as number], b.weekId, juror.id)
      await votes(p.entryId, [others[i] as number])
    }
    await seal()
    return juror
  }

  it('RF-GAME-06: el caso del Anexo G no gana (ρ = 22/√1501, sin sus votos)', async () => {
    const juror = await anexoG(3)
    expect(await sumOf(juror.id, 'golden_ear')).toBe(0)
    expect(await unlocks(juror.id)).toEqual([])
  })

  it('RF-GAME-06: con 2 estrellas a la 7.ª gana (ρ = 24/√1482): 75 XP y golden_ear; «tu resultado» lo dice', async () => {
    const juror = await anexoG(2)
    expect(await sumOf(juror.id, 'golden_ear')).toBe(75)
    expect(await unlocks(juror.id)).toEqual(['golden_ear'])
    expect((await results(juror.cookie)).json().data.myGame).toEqual({
      xp: 75,
      goldenEar: true,
      seasonPoints: 0,
    })
  })

  it('RF-GAME-06: con menos de 8 votos válidos no hay oído de oro', async () => {
    b = await battle({ producers: 7, voters: 1 })
    const juror = b.voters[0] as Battle['voters'][0]
    for (const [i, p] of b.producers.entries()) {
      await votes(p.entryId, [1 + (i % 5)], b.weekId, juror.id)
      await votes(p.entryId, [1 + (i % 5)])
    }
    await seal()
    expect(await sumOf(juror.id, 'golden_ear')).toBe(0)
  })
})

describe('RF-GAME-10: el sellado no depende de la capa de juego (7.10)', () => {
  it('RF-GAME-10: dos votantes de nivel 1 y 20 pesan igual en el snapshot', async () => {
    b = await battle({ producers: 2, voters: 2 })
    const [x, y] = b.producers.map((p) => p.entryId) as [string, string]
    const [veteran, rookie] = b.voters as [Battle['voters'][0], Battle['voters'][0]]
    await b.t.db.insert(xpEvent).values({
      id: 'veterano',
      userId: veteran.id,
      kind: 'result',
      ref: 'w-antigua',
      weekId: 'w-antigua',
      amount: xpForLevel(LEVEL_MAX),
      createdAt: 0,
    })
    await b.t.db
      .update(producerProfile)
      .set({ xp: xpForLevel(LEVEL_MAX) })
      .where(eq(producerProfile.userId, veteran.id))
    await votes(x, [3, 3, 3])
    await votes(y, [3, 3, 3])
    await votes(x, [5], b.weekId, veteran.id)
    await votes(y, [1], b.weekId, veteran.id)
    await votes(x, [1], b.weekId, rookie.id)
    await votes(y, [5], b.weekId, rookie.id)
    await seal()
    const rows = await b.t.db.select().from(result).where(eq(result.weekId, b.weekId))
    expect(rows.map((row) => row.position)).toEqual([1, 1])
    expect(rows[0]?.scoreMilli).toBe(rows[1]?.scoreMilli)
  })

  it('RF-GAME-10: el snapshot no importa nada de la capa de juego y `rank` no ve al votante', () => {
    const code = readFileSync(
      join(import.meta.dirname, '..', 'src', 'modules', 'results', 'snapshot.ts'),
      'utf8',
    )
    const imports = [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1])
    expect(imports.some((from) => from?.includes('game'))).toBe(false)
    expect(code).toMatch(/votes\.map\(\(\{ entryId, stars \}\) => \(\{ entryId, stars \}\)\)/)
  })
})

describe('la racha al sellar (7.10, §2.10)', () => {
  /** Las semanas 40 y 41, selladas antes de la 42 (que pasa a ser la número 3), con una entrada clasificada de `userId`. */
  async function history(userId: string, { rival }: { rival: string }) {
    const [s] = await b.t.db.select({ id: sample.id }).from(sample)
    await b.t.db.update(week).set({ number: 3 }).where(eq(week.id, b.weekId))
    const made: Record<string, string> = {}
    for (const [number, day, id] of [
      [1, 28, 'w40'],
      [2, 5, 'w41'],
    ] as const) {
      const bounds = boundaries({ year: 2026, month: number === 1 ? 9 : 10, day })
      await b.t.db.insert(week).values({
        id,
        number,
        slug: `2026-${id}`,
        seasonId: '2026-T4',
        sampleId: s?.id as string,
        rulesVersion: 1,
        ...bounds,
        sealedAt: bounds.voteEndsAt,
        resultRevision: 1,
        createdBy: 'test',
        createdAt: 0,
      })
      // Su entrada y la de un rival, con votos de verdad: un re-sellado las vuelve a clasificar igual.
      for (const [owner, stars] of [
        [userId, [4, 4, 5]],
        [rival, [3, 3, 3]],
      ] as const) {
        const values = entryValues(id, owner, { submittedAt: bounds.startsAt + 1 })
        await b.t.db.insert(entry).values(values)
        await votes(values.id, [...stars], id)
        if (owner === userId) made[id] = values.id
      }
      const snapshot = await computeSnapshot(b.t.db, id)
      for (const row of snapshot.rows)
        await b.t.db.insert(result).values({
          weekId: id,
          revision: 1,
          entryId: row.entryId,
          position: row.position,
          scoreMilli: row.scoreMilli,
          votes: row.votes,
          meanMilli: row.meanMilli,
          medianHalf: row.medianHalf,
          histogram: JSON.stringify(row.histogram),
          seasonPoints: row.seasonPoints,
        })
    }
    return made
  }

  it('RF-GAME-04: con dos semanas selladas clasificadas, la tercera paga el resultado con +20 % y da streak_3 (y lo que se cumple con ellas)', async () => {
    b = await battle({ producers: 2, voters: 0 })
    const [me, rival] = b.producers as [Battle['producers'][0], Battle['producers'][0]]
    await history(me.id, { rival: rival.id })
    await votes(me.entryId, [5, 5, 4])
    await votes(rival.entryId, [2, 2, 2])
    await seal()
    // 1.º con racha en juego 3: 500 · 1,2 = 600.
    expect(await sumOf(me.id, 'result', b.weekId)).toBe(600)
    // 1.º en las tres: también win_3 (tres victorias) y double (dos seguidas), que se cumplen al sellar esta.
    expect(await unlocks(me.id)).toEqual(['double', 'podium', 'streak_3', 'win', 'win_3'])
    const [streak] = await b.t.db.select().from(streakState).where(eq(streakState.userId, me.id))
    expect(streak).toMatchObject({ current: 3, best: 3, lastWeekNumber: 3, jokerSeason: null })
    // Lo de las semanas anteriores no se paga aquí (eso es el reprocesado, 7.16).
    expect((await ledger(me.id)).filter((row) => row.weekId !== b.weekId)).toEqual([])
  })

  it('RF-GAME-04: sin entrada en la semana que se sella, quien tenía racha gasta el comodín (y la racha no suma)', async () => {
    b = await battle({ producers: 2, voters: 0 })
    const [me, rival] = b.producers as [Battle['producers'][0], Battle['producers'][0]]
    await history(me.id, { rival: rival.id })
    // La racha guardada tras la 41 (la que habría dejado su sellado).
    await b.t.db
      .insert(streakState)
      .values({ userId: me.id, current: 2, best: 2, lastWeekNumber: 2, jokerSeason: null })
    await b.t.db.update(entry).set({ status: 'withdrawn' }).where(eq(entry.id, me.entryId))
    await votes(rival.entryId, [2, 2, 2])
    await seal()
    const [streak] = await b.t.db.select().from(streakState).where(eq(streakState.userId, me.id))
    expect(streak).toMatchObject({ current: 2, best: 2, lastWeekNumber: 3, jokerSeason: '2026-T4' })
    expect(await ledger(me.id)).toEqual([])
  })
})

describe('el re-sellado y la capa de juego (7.10, §2.8, hueco G2)', () => {
  it('§2.8: un re-sellado que no cambia el snapshot no cambia nada para nadie', async () => {
    await podiumOfFour()
    await seal()
    const before = await allLedger()
    const unlocked = await b.t.db.select().from(achievementUnlock)
    expect((await reseal()).json().data).toEqual({ revision: 2 })
    expect(await allLedger()).toEqual(before)
    expect(await b.t.db.select().from(achievementUnlock)).toEqual(unlocked)
  })

  it('§2.8: descalificar al 1.º y re-sellar: el libro queda como da la revisión nueva (ajustes que restan y suman) y win y podium cambian de manos', async () => {
    const { p1, p2, p3, p4 } = await podiumOfFour()
    await seal()
    expect((await disqualify(p1.entryId)).statusCode).toBe(204)
    expect((await reseal()).json().data).toEqual({ revision: 2 })
    // El 1.º descalificado: −500 y fuera win y podium con su XP.
    expect(await sumOf(p1.id, 'result')).toBe(0)
    expect(await unlocks(p1.id)).toEqual([])
    expect(await cachedXp(p1.id)).toBe(0)
    const rows = await ledger(p1.id)
    expect(rows.map((r) => [r.kind, r.amount])).toEqual([
      ['result', 500],
      ['result', -500],
    ])
    expect(rows[1]?.ref).toBe(`${b.weekId}#${b.weekId}:2`)
    // Los demás suben un puesto: 500, 350 y 250, y el nuevo podio.
    expect([
      await sumOf(p2.id, 'result'),
      await sumOf(p3.id, 'result'),
      await sumOf(p4.id, 'result'),
    ]).toEqual([500, 350, 250])
    expect(await unlocks(p2.id)).toEqual(['podium', 'win'])
    expect(await unlocks(p4.id)).toEqual(['podium'])
    for (const p of [p1, p2, p3, p4]) expect(await cachedXp(p.id)).toBe(await sumOf(p.id))
    // «Tu resultado» al día.
    expect((await results(p4.cookie)).json().data.myGame).toEqual({
      xp: 250,
      goldenEar: false,
      seasonPoints: 15,
    })
    // Re-ejecutar la capa de juego de esa revisión no cambia nada (`RF-GAME-01`).
    const before = await allLedger()
    let n = 0
    await runBatch(
      b.t.db,
      await sealingStatements(b.t.db, {
        weekId: b.weekId,
        revision: 2,
        snapshot: await computeSnapshot(b.t.db, b.weekId),
        now: W42.voteEndsAt + 9,
        newId: () => `otra-${++n}`,
      }),
    )
    expect(await allLedger()).toEqual(before)
  })

  it('§2.8: corregir una semana anterior re-juega las siguientes: la racha y el XP de la última, y el logro que ya no se cumple', async () => {
    b = await battle({ producers: 2, voters: 0 })
    const [me, rival] = b.producers as [Battle['producers'][0], Battle['producers'][0]]
    const made = await (async () => {
      const [s] = await b.t.db.select({ id: sample.id }).from(sample)
      await b.t.db.update(week).set({ number: 3 }).where(eq(week.id, b.weekId))
      const out: Record<string, string> = {}
      for (const [number, month, day, id] of [
        [1, 9, 28, 'w40'],
        [2, 10, 5, 'w41'],
      ] as const) {
        const bounds = boundaries({ year: 2026, month, day })
        await b.t.db.insert(week).values({
          id,
          number,
          slug: `2026-${id}`,
          seasonId: '2026-T4',
          sampleId: s?.id as string,
          rulesVersion: 1,
          ...bounds,
          sealedAt: null,
          resultRevision: 0,
          createdBy: 'test',
          createdAt: 0,
        })
        for (const [owner, stars] of [
          [me.id, [4, 4, 5]],
          [rival.id, [3, 3, 3]],
        ] as const) {
          const values = entryValues(id, owner, { submittedAt: bounds.startsAt + 1 })
          await b.t.db.insert(entry).values(values)
          await votes(values.id, [...stars], id)
          if (owner === me.id) out[id] = values.id
        }
        // Sellada de verdad, en orden, con su capa de juego.
        expect(await sealWeek(b.t.db, { weekId: id, now: bounds.voteEndsAt, holder: 'test' })).toBe(true)
      }
      return out
    })()
    await votes(me.entryId, [5, 5, 4])
    await votes(rival.entryId, [2, 2, 2])
    await seal()
    expect(await sumOf(me.id, 'result', b.weekId)).toBe(600) // racha en juego 3
    expect(await unlocks(me.id)).toContain('streak_3')
    // Plagio en su entrada de la 41: fuera y re-sellar la 41.
    expect((await disqualify(made.w41 as string)).statusCode).toBe(204)
    expect((await reseal('2026-w41')).json().data).toEqual({ revision: 2 })
    // La 41 ya no le da nada (−550 de su 1.º con racha 2), y la racha queda 1, comodín, 2: la 42 se paga con +10 %
    // (550). double (41), streak_3 y win_3 (42) ya no se cumplen en ninguna semana: fuera con su XP; los de la 40, no.
    expect(await sumOf(me.id, 'result', 'w41')).toBe(0)
    expect(await sumOf(me.id, 'result', b.weekId)).toBe(550)
    expect(await unlocks(me.id)).toEqual(['podium', 'win'])
    const [streak] = await b.t.db.select().from(streakState).where(eq(streakState.userId, me.id))
    expect(streak).toMatchObject({ current: 2, best: 2, lastWeekNumber: 3, jokerSeason: '2026-T4' })
    // El rival pasa a ganar la 41 (con racha en juego 2: 550) y se lleva win y comeback (2.º de 2 en la 40, la mitad
    // baja); su streak_3 de la 42 sigue.
    expect(await sumOf(rival.id, 'result', 'w41')).toBe(550)
    expect(await unlocks(rival.id)).toEqual(['comeback', 'podium', 'streak_3', 'win'])
    for (const p of [me, rival]) expect(await cachedXp(p.id)).toBe(await sumOf(p.id))
  })
})
