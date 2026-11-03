import { evaluate, LEVEL_MAX, levelOf, STREAK_START, XP_VOTE_MAX_VOTES_PER_WEEK } from '@beatbattle/rules'
import { eq, sql } from 'drizzle-orm'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { runBatch } from '../src/db/batch'
import type { Db } from '../src/db/client'
import { achievementUnlock, producerProfile, streakState, user, xpEvent } from '../src/db/schema'
import { createTestDb } from '../src/db/testDb'
import { LEVEL_20_XP } from '../src/modules/game/repo'
import { createGameService, type GameService, type XpGrant } from '../src/modules/game/service'
import { T0 } from './helpers'

/**
 * El módulo `game` (guía §2.10, §4.11; tarea 7.8): el libro de XP y los logros como sentencias idempotentes para el
 * `batch` del hecho, la caché `producer_profile.xp` y el tope semanal de votos contado en el libro.
 */

let accounts = 0
let ids = 0
const newId = () => `id-${String(++ids).padStart(6, '0')}`

/** Una cuenta con su perfil (la caché de XP vive en `producer_profile`). */
async function account(db: Db): Promise<string> {
  accounts += 1
  const id = `u${accounts}`
  await db.insert(user).values({ id, name: id, email: `${id}@example.com`, username: id })
  await db.insert(producerProfile).values({ userId: id, cardNumber: accounts, createdAt: T0 })
  return id
}

async function setup() {
  const db = await createTestDb()
  return { db, game: createGameService({ db, newId }) }
}

/** Planifica y aplica un hecho en su propio `batch`; devuelve lo que dijo que ganaba. */
async function apply(db: Db, game: GameService, userId: string, input: Parameters<GameService['plan']>[1]) {
  const plan = await game.plan(userId, input)
  await runBatch(db, plan.statements)
  return plan.delta
}

const cached = async (db: Db, userId: string) =>
  (
    await db
      .select({ xp: producerProfile.xp })
      .from(producerProfile)
      .where(eq(producerProfile.userId, userId))
  )[0]?.xp
const ledger = async (db: Db, userId: string) =>
  db.select().from(xpEvent).where(eq(xpEvent.userId, userId)).orderBy(xpEvent.kind, xpEvent.ref)
const ledgerSum = async (db: Db, userId: string) =>
  Number(
    (
      await db
        .select({ n: sql<number>`coalesce(sum(${xpEvent.amount}), 0)` })
        .from(xpEvent)
        .where(eq(xpEvent.userId, userId))
    )[0]?.n,
  )

/** Lo que pasa en una semana sellada para una cuenta: subir, primera entrada, votos, resultado y oído de oro. */
const weekOf = (weekId: string, entries: string[]): XpGrant[] => [
  { kind: 'entry', ref: weekId, weekId, amount: 110 },
  { kind: 'first_entry_of_week', ref: weekId, weekId, amount: 25 },
  ...entries.map((entryId) => ({ kind: 'vote' as const, ref: entryId, weekId, amount: 5, weeklyCap: 40 })),
  { kind: 'result', ref: weekId, weekId, amount: 275 },
  { kind: 'golden_ear', ref: weekId, weekId, amount: 75 },
]

describe('el libro de XP (7.8, §4.11)', () => {
  it('RF-GAME-01: re-ejecutar los mismos eventos (sellado, reprocesado) no cambia el XP de nadie', async () => {
    const { db, game } = await setup()
    const [aina, bru] = [await account(db), await account(db)]
    const facts = (userId: string) => ({
      xp: weekOf('w1', [`e-${userId}-1`, `e-${userId}-2`]),
      events: [{ event: { kind: 'sampleDownloaded' } as const, ref: 'w1', weekId: 'w1' }],
      now: T0,
    })
    const first = await apply(db, game, aina, facts(aina))
    await apply(db, game, bru, facts(bru))
    // Aina sube primero: la primera entrada de la semana es suya (una para toda la batalla).
    expect(first).toEqual({ xp: 110 + 25 + 10 + 275 + 75 + 25, achievements: ['first_drop'], level: 3 })
    const xpAina = await cached(db, aina)
    const xpBru = await cached(db, bru)
    const rows = [...(await ledger(db, aina)), ...(await ledger(db, bru))]
    expect(xpAina).toBe(520)
    expect(xpBru).toBe(520 - 25)
    for (let again = 0; again < 3; again++) {
      const repeat = await apply(db, game, aina, { ...facts(aina), now: T0 + again + 1 })
      expect(repeat).toEqual({ xp: 0, achievements: [], level: 3 })
      await apply(db, game, bru, facts(bru))
    }
    expect(await cached(db, aina)).toBe(xpAina)
    expect(await cached(db, bru)).toBe(xpBru)
    expect([...(await ledger(db, aina)), ...(await ledger(db, bru))]).toEqual(rows)
    expect(await db.select().from(achievementUnlock)).toHaveLength(2)
  })

  it('RF-GAME-01: la caché producer_profile.xp es siempre la suma del libro', async () => {
    const { db, game } = await setup()
    const userId = await account(db)
    await apply(db, game, userId, { xp: weekOf('w1', ['e1']), now: T0 })
    // Aunque la caché se desvíe (a mano, o un movimiento que ya estaba), el siguiente hecho la deja bien.
    await db.update(producerProfile).set({ xp: 999_999 }).where(eq(producerProfile.userId, userId))
    await apply(db, game, userId, { xp: weekOf('w1', ['e1']), now: T0 })
    expect(await cached(db, userId)).toBe(await ledgerSum(db, userId))
    expect(await cached(db, userId)).toBe(110 + 25 + 5 + 275 + 75)
  })

  it('RF-GAME-01 (propiedad): con hechos repetidos y en cualquier orden, el libro tiene uno por tipo y referencia y la caché es su suma', async () => {
    const { db, game } = await setup()
    const grant = fc.record({
      kind: fc.constantFrom('entry' as const, 'vote' as const, 'result' as const, 'golden_ear' as const),
      ref: fc.constantFrom('a', 'b', 'c', 'd'),
      amount: fc.integer({ min: 0, max: 500 }),
    })
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.array(grant, { maxLength: 6 }), { minLength: 1, maxLength: 6 }),
        async (facts) => {
          const userId = await account(db)
          const firstAmount = new Map<string, number>()
          for (const fact of facts) {
            await apply(db, game, userId, {
              xp: fact.map((g) => ({ ...g, weekId: 'w1' })),
              now: T0,
            })
            for (const g of fact)
              if (g.amount > 0 && !firstAmount.has(`${g.kind}:${g.ref}`))
                firstAmount.set(`${g.kind}:${g.ref}`, g.amount)
          }
          const rows = await ledger(db, userId)
          expect(rows.map((r) => `${r.kind}:${r.ref}`).sort()).toEqual([...firstAmount.keys()].sort())
          const expected = [...firstAmount.values()].reduce((a, b) => a + b, 0)
          expect(await ledgerSum(db, userId)).toBe(expected)
          expect(await cached(db, userId)).toBe(expected)
        },
      ),
      { numRuns: 40 },
    )
  })

  it('§4.11: lo de la capa de juego va en el batch del hecho: si el hecho falla, no queda nada', async () => {
    const { db, game } = await setup()
    const userId = await account(db)
    const plan = await game.plan(userId, { xp: weekOf('w1', ['e1']), now: T0 })
    // El hecho que lo provoca choca (un perfil repetido) y el batch entero se deshace.
    const failing = db.insert(producerProfile).values({ userId, cardNumber: 9999, createdAt: T0 })
    await expect(runBatch(db, [...plan.statements, failing])).rejects.toThrow()
    expect(await ledger(db, userId)).toEqual([])
    expect(await cached(db, userId)).toBe(0)
  })

  it('§2.10: la primera entrada de la semana es de una sola cuenta, y la vista previa no se la promete a la segunda', async () => {
    const { db, game } = await setup()
    const [aina, bru] = [await account(db), await account(db)]
    const first = { kind: 'first_entry_of_week' as const, ref: 'w1', weekId: 'w1', amount: 25 }
    expect((await apply(db, game, aina, { xp: [first], now: T0 })).xp).toBe(25)
    expect((await apply(db, game, bru, { xp: [first], now: T0 })).xp).toBe(0)
    expect(await cached(db, bru)).toBe(0)
  })

  it('un hecho sin nada que ganar no escribe nada', async () => {
    const { db, game } = await setup()
    const userId = await account(db)
    const plan = await game.plan(userId, {
      xp: [{ kind: 'vote', ref: 'e1', weekId: 'w1', amount: 0 }],
      now: T0,
    })
    expect(plan).toEqual({ statements: [], delta: { xp: 0, achievements: [], level: 1 } })
    await expect(
      game.plan(userId, { xp: [{ kind: 'vote', ref: 'e1', weekId: 'w1', amount: -5 }], now: T0 }),
    ).rejects.toThrow(RangeError)
  })
})

describe('el tope semanal de votos con XP (7.8, Anexo B)', () => {
  it('RF-GAME-03: 50 votos en una semana dan 40 × 5 XP; quitar y volver a votar no suma', async () => {
    const { db, game } = await setup()
    const userId = await account(db)
    let total = 0
    for (let i = 1; i <= 50; i++) {
      const grant = await game.voteGrant(userId, { entryId: `e${i}`, weekId: 'w1', goldenWeek: false })
      total += (await apply(db, game, userId, { xp: [grant], now: T0 + i })).xp
    }
    expect(total).toBe(XP_VOTE_MAX_VOTES_PER_WEEK * 5)
    expect(await cached(db, userId)).toBe(200)
    expect(await ledger(db, userId)).toHaveLength(40)
    // Volver a votar la primera entrada (tras quitar el voto): no suma.
    const again = await game.voteGrant(userId, { entryId: 'e1', weekId: 'w1', goldenWeek: false })
    expect(again.amount).toBe(0)
    // Otra semana, otro tope; y en la dorada, el doble.
    const golden = await game.voteGrant(userId, { entryId: 'x1', weekId: 'w2', goldenWeek: true })
    expect(golden).toMatchObject({ amount: 10, weeklyCap: 40 })
    expect((await apply(db, game, userId, { xp: [golden], now: T0 })).xp).toBe(10)
  })

  it('RF-GAME-03: el tope se cuenta dentro de la sentencia: dos votos a la vez con 39 hechos dejan 40', async () => {
    const { db, game } = await setup()
    const userId = await account(db)
    for (let i = 1; i <= 39; i++)
      await apply(db, game, userId, {
        xp: [await game.voteGrant(userId, { entryId: `e${i}`, weekId: 'w1', goldenWeek: false })],
        now: T0,
      })
    // Los dos se preparan antes de que ninguno se escriba: los dos creen que les toca.
    const a = await game.plan(userId, {
      xp: [await game.voteGrant(userId, { entryId: 'e40', weekId: 'w1', goldenWeek: false })],
      now: T0,
    })
    const b = await game.plan(userId, {
      xp: [await game.voteGrant(userId, { entryId: 'e41', weekId: 'w1', goldenWeek: false })],
      now: T0,
    })
    expect([a.delta.xp, b.delta.xp]).toEqual([5, 5])
    await runBatch(db, a.statements)
    await runBatch(db, b.statements)
    expect(await ledger(db, userId)).toHaveLength(40)
    expect(await cached(db, userId)).toBe(200)
  })
})

describe('los logros (7.8, Anexo C)', () => {
  it('RF-GAME-05: un logro se gana una vez, y su XP (el de su rareza) va referido a él', async () => {
    const { db, game } = await setup()
    const userId = await account(db)
    const vote = (votesTotal: number) => ({
      event: {
        kind: 'voteCast' as const,
        votesTotal,
        castAt: T0,
        nightVotes: 0,
        votedEntries: votesTotal,
        votableEntries: 20,
      },
      ref: `e${votesTotal}`,
      weekId: 'w1',
    })
    expect(await apply(db, game, userId, { events: [vote(1)], now: T0 })).toEqual({
      xp: 25,
      achievements: ['first_vote'],
      level: 1,
    })
    expect(await apply(db, game, userId, { events: [vote(2)], now: T0 + 1 })).toEqual({
      xp: 0,
      achievements: [],
      level: 1,
    })
    // También si se pide a mano otra vez.
    await apply(db, game, userId, {
      achievements: [{ id: 'first_vote', ref: 'e9', weekId: 'w2' }],
      now: T0 + 2,
    })
    expect(await db.select().from(achievementUnlock)).toEqual([
      { userId, achievementId: 'first_vote', ref: 'e1', weekId: 'w1', unlockedAt: T0, seenAt: null },
    ])
    expect(await ledger(db, userId)).toMatchObject([
      { kind: 'achievement', ref: 'first_vote', amount: 25, weekId: 'w1' },
    ])
  })

  it('RF-GAME-05: varios logros del mismo evento, en el orden del catálogo, cada uno con su XP', async () => {
    const { db, game } = await setup()
    const userId = await account(db)
    const delta = await apply(db, game, userId, {
      events: [
        {
          event: {
            kind: 'entryActivated',
            entriesTotal: 1,
            firstOfWeek: true,
            submittedAt: T0,
            submitEndsAt: T0 + 60_000,
            goldenWeek: true,
          },
          ref: 'e1',
          weekId: 'w1',
        },
      ],
      now: T0,
    })
    // first_entry (25) · early_bird (75) · last_minute (75) · golden_week (150)
    expect(delta).toEqual({
      xp: 25 + 75 + 75 + 150,
      achievements: ['first_entry', 'early_bird', 'last_minute', 'golden_week'],
      level: 2,
    })
    expect(await cached(db, userId)).toBe(325)
  })

  it('RF-GAME-05: level_20 al cruzar el nivel 20, también si lo empuja el XP de otro logro, una sola vez', async () => {
    const { db, game } = await setup()
    const userId = await account(db)
    // La condición de SQL es la de las reglas.
    expect(evaluate({ kind: 'xpChanged', xp: LEVEL_20_XP }, { unlocked: new Set() })).toEqual(['level_20'])
    expect(evaluate({ kind: 'xpChanged', xp: LEVEL_20_XP - 1 }, { unlocked: new Set() })).toEqual([])
    await apply(db, game, userId, {
      xp: [{ kind: 'result', ref: 'w1', weekId: 'w1', amount: LEVEL_20_XP - 100 }],
      now: T0,
    })
    expect(await db.select().from(achievementUnlock)).toEqual([])
    // Un logro épico (150 XP) lo empuja al nivel 20: level_20 (300 XP) en el mismo batch.
    const delta = await apply(db, game, userId, {
      achievements: [{ id: 'win', ref: 'w2', weekId: 'w2' }],
      now: T0,
    })
    expect(delta).toEqual({ xp: 150 + 300, achievements: ['win', 'level_20'], level: LEVEL_MAX })
    expect(await cached(db, userId)).toBe(LEVEL_20_XP - 100 + 150 + 300)
    expect(levelOf((await cached(db, userId)) as number)).toBe(LEVEL_MAX)
    // Otro hecho no lo repite.
    expect(
      (await apply(db, game, userId, { achievements: [{ id: 'podium', ref: 'w2', weekId: 'w2' }], now: T0 }))
        .achievements,
    ).toEqual(['podium'])
    const level20 = await db.select().from(xpEvent).where(eq(xpEvent.ref, 'level_20'))
    expect(level20).toMatchObject([{ kind: 'achievement', amount: 300, weekId: 'w2' }])
  })
})

describe('la racha guardada (7.8, §2.10)', () => {
  it('RF-GAME-04: una fila por cuenta; guardarla otra vez deja el último estado', async () => {
    const { db, game } = await setup()
    const userId = await account(db)
    expect(await game.streak(userId)).toEqual(STREAK_START)
    const state = { current: 4, best: 4, lastWeekNumber: 4, jokerSeason: null }
    await runBatch(db, [game.streakStatement(userId, state), game.streakStatement(userId, state)])
    const spent = { ...state, lastWeekNumber: 5, jokerSeason: '2026-T4' }
    await runBatch(db, [game.streakStatement(userId, spent)])
    expect(await game.streak(userId)).toEqual(spent)
    expect(await db.select().from(streakState)).toHaveLength(1)
  })
})
