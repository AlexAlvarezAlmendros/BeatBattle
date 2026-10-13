import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { fairOrder, fairSeed, juryQueue, newestOrder, randomOrder } from '../src/fair'

const ids = fc.uniqueArray(fc.string({ minLength: 1, maxLength: 12 }), { maxLength: 30 })
const SEED = fairSeed('week-1', { userId: 'user-1' })

/** Entradas con sus votos y lo que quien mira ya ha votado. */
const scenario = ids.chain((list) =>
  fc.record({
    entries: fc.constant(list.map((id) => ({ id }))),
    votes: fc
      .tuple(...list.map(() => fc.nat(20)))
      .map((counts) => Object.fromEntries(list.map((id, i) => [id, counts[i] ?? 0]))),
    voted: fc.subarray(list),
  }),
)

const order = (list: readonly { id: string }[]) => list.map((entry) => entry.id)

describe('fairOrder: Ronda justa (§2.6)', () => {
  it('RF-PLAY-04: con 3 entradas de 0, 5 y 2 votos, quien no ha votado ninguna las ve 0, 2, 5', () => {
    const entries = [{ id: 'cero' }, { id: 'cinco' }, { id: 'dos' }]
    const votes = { cero: 0, cinco: 5, dos: 2 }
    expect(order(fairOrder(entries, votes, [], SEED))).toEqual(['cero', 'dos', 'cinco'])
    expect(order(fairOrder(entries, new Map(Object.entries(votes)), [], SEED))).toEqual([
      'cero',
      'dos',
      'cinco',
    ])
  })

  it('RF-PLAY-04: primero las sin votar y, dentro de cada grupo, las que menos votos llevan', () => {
    fc.assert(
      fc.property(scenario, ({ entries, votes, voted }) => {
        const seen = new Set(voted)
        const sorted = fairOrder(entries, votes, voted, SEED)
        for (let i = 1; i < sorted.length; i++) {
          const a = sorted[i - 1] as { id: string }
          const b = sorted[i] as { id: string }
          const groupA = Number(seen.has(a.id))
          const groupB = Number(seen.has(b.id))
          expect(groupA).toBeLessThanOrEqual(groupB)
          if (groupA === groupB) expect(votes[a.id]).toBeLessThanOrEqual(votes[b.id] as number)
        }
      }),
    )
  })

  it('RF-PLAY-04: es una permutación, no depende del orden de llegada y no cambia la lista original', () => {
    fc.assert(
      fc.property(
        scenario.chain((s) =>
          fc.record({
            s: fc.constant(s),
            shuffled: fc.shuffledSubarray(s.entries, { minLength: s.entries.length }),
          }),
        ),
        ({ s, shuffled }) => {
          const before = order(s.entries)
          const sorted = fairOrder(s.entries, s.votes, s.voted, SEED)
          expect(order(s.entries)).toEqual(before)
          expect(order(sorted).slice().sort()).toEqual(before.slice().sort())
          expect(order(fairOrder(shuffled, s.votes, s.voted, SEED))).toEqual(order(sorted))
        },
      ),
    )
  })

  it('RF-PLAY-04: el desempate es estable por usuario y semana, y cambia con quien mira', () => {
    const entries = Array.from({ length: 12 }, (_, i) => ({ id: `e${i}` }))
    const a = order(fairOrder(entries, {}, [], fairSeed('w', { userId: 'ana' })))
    expect(order(fairOrder(entries, {}, [], fairSeed('w', { userId: 'ana' })))).toEqual(a)
    expect(order(fairOrder(entries, {}, [], fairSeed('w', { userId: 'bea' })))).not.toEqual(a)
    expect(order(fairOrder(entries, {}, [], fairSeed('w2', { userId: 'ana' })))).not.toEqual(a)
  })

  it('RF-PLAY-04: los visitantes ven el mismo orden todo el día (Madrid) y otro al día siguiente', () => {
    // Martes 13 de octubre de 2026: 00:30 y 23:30 en Madrid (UTC+2), y el miércoles a las 00:30.
    const morning = Date.UTC(2026, 9, 12, 22, 30)
    const night = Date.UTC(2026, 9, 13, 21, 30)
    const next = Date.UTC(2026, 9, 13, 22, 30)
    expect(fairSeed('w', { nowMs: morning })).toEqual(fairSeed('w', { nowMs: night }))
    expect(fairSeed('w', { nowMs: next })).not.toEqual(fairSeed('w', { nowMs: night }))
    expect(fairSeed('w', { nowMs: morning })).not.toEqual(fairSeed('w', { userId: 'ana' }))
  })

  it('RF-PLAY-04: los votos que faltan, negativos o no finitos cuentan como 0', () => {
    const entries = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const sorted = order(fairOrder(entries, { a: 3, b: -1, c: Number.NaN }, [], SEED))
    expect(sorted.at(-1)).toBe('a')
  })
})

describe('newestOrder y randomOrder', () => {
  it('Recién subidas: la última primero y, a igualdad, por id', () => {
    const entries = [
      { id: 'b', submittedAt: 10 },
      { id: 'a', submittedAt: 10 },
      { id: 'c', submittedAt: 30 },
    ]
    expect(order(newestOrder(entries))).toEqual(['c', 'a', 'b'])
  })

  it('Aleatorio: misma semilla, mismo orden, llegue como llegue; otra semilla, otro orden', () => {
    fc.assert(
      fc.property(ids, fc.string(), (list, seed) => {
        const entries = list.map((id) => ({ id }))
        const reversed = entries.slice().reverse()
        expect(order(randomOrder(reversed, [seed]))).toEqual(order(randomOrder(entries, [seed])))
        expect(order(randomOrder(entries, [seed])).sort()).toEqual(list.slice().sort())
      }),
    )
    const entries = Array.from({ length: 12 }, (_, i) => ({ id: `e${i}` }))
    expect(order(randomOrder(entries, ['x']))).not.toEqual(order(randomOrder(entries, ['y'])))
  })
})

describe('juryQueue: la cola del Modo Jurado (§2.7)', () => {
  it('RF-VOTE-09: sin las votadas ni la propia, en Ronda justa', () => {
    fc.assert(
      fc.property(scenario, fc.option(fc.string({ minLength: 1 })), ({ entries, votes, voted }, own) => {
        const excluded = own === null ? [] : [own]
        const queue = juryQueue(entries, votes, voted, SEED, { excluded })
        const expected = fairOrder(entries, votes, voted, SEED).filter(
          (entry) => !voted.includes(entry.id) && entry.id !== own,
        )
        expect(order(queue)).toEqual(order(expected))
      }),
    )
  })

  it('RF-VOTE-09: saltar manda la entrada al final; el último salto es el que cuenta', () => {
    const entries = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
    const votes = { a: 0, b: 1, c: 2, d: 3 }
    expect(order(juryQueue(entries, votes, [], SEED, { skipped: ['a'] }))).toEqual(['b', 'c', 'd', 'a'])
    expect(order(juryQueue(entries, votes, [], SEED, { skipped: ['a', 'b'] }))).toEqual(['c', 'd', 'a', 'b'])
    expect(order(juryQueue(entries, votes, [], SEED, { skipped: ['a', 'b', 'a'] }))).toEqual([
      'c',
      'd',
      'b',
      'a',
    ])
  })

  it('RF-VOTE-13: quitar un voto devuelve la entrada a la cola', () => {
    const entries = [{ id: 'a' }, { id: 'b' }]
    expect(order(juryQueue(entries, {}, ['a'], SEED))).toEqual(['b'])
    expect(order(juryQueue(entries, {}, [], SEED)).sort()).toEqual(['a', 'b'])
  })
})
