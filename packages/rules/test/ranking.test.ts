import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { type RankVote, rank } from '../src/ranking'

const votesFor = (entryId: string, stars: number[]): RankVote[] => stars.map((s) => ({ entryId, stars: s }))
/** `n` votos que suman `sum` (con estrellas de 1 a 5). */
function spread(entryId: string, n: number, sum: number): RankVote[] {
  const stars = Array.from({ length: n }, () => 1)
  let left = sum - n
  for (let i = 0; i < n && left > 0; i++) {
    const add = Math.min(4, left)
    stars[i] = 1 + add
    left -= add
  }
  return votesFor(entryId, stars)
}

describe('rank: la clasificación de la semana (§2.8, Anexo G)', () => {
  it('RF-RES-01: Anexo G con m = 3,6 y C = 5: A 3,8333 · B 4,4000 · C 4,0000; orden B, C y A sin clasificar', () => {
    const entries = ['A', 'B', 'C', 'D'].map((id, i) => ({ id, submittedAt: i }))
    // D completa la semana hasta m = 3,6: 21 votos que suman 49 (29 + 21 = 50 votos, 131 + 49 = 180).
    const votes = [
      ...votesFor('A', [5]),
      ...spread('B', 20, 92),
      ...spread('C', 8, 34),
      ...spread('D', 21, 49),
    ]
    const result = rank(entries, votes)
    const by = Object.fromEntries(result.map((row) => [row.entryId, row]))
    expect(by.A?.scoreMilli).toBe(3833)
    expect(by.B?.scoreMilli).toBe(4400)
    expect(by.C?.scoreMilli).toBe(4000)
    expect(result.map((row) => row.entryId)).toEqual(['B', 'C', 'D', 'A'])
    expect(by.A?.position).toBeNull()
    expect(by.B).toMatchObject({ position: 1, votes: 20, meanMilli: 4600, seasonPoints: 25 })
  })

  it('RF-RES-03: una entrada con 2 votos de 5 no entra en el podio aunque su puntuación lo permita', () => {
    const entries = [
      { id: 'dos', submittedAt: 1 },
      { id: 'tres', submittedAt: 2 },
    ]
    const result = rank(entries, [...votesFor('dos', [5, 5]), ...votesFor('tres', [3, 3, 3])])
    expect(result.find((row) => row.entryId === 'dos')).toMatchObject({ position: null, seasonPoints: 0 })
    expect(result.find((row) => row.entryId === 'tres')).toMatchObject({ position: 1 })
  })

  it('RF-RES-02: desempates (votos → mediana → cincos) y ex aequo que comparte posición (1, 1, 3)', () => {
    const entries = ['a', 'b', 'c', 'd'].map((id, i) => ({ id, submittedAt: i }))
    const votes = [
      ...votesFor('a', [4, 4, 4]),
      ...votesFor('b', [4, 4, 4]), // igual que a: ex aequo
      ...votesFor('c', [3, 3, 3]),
      ...votesFor('d', [1, 1, 1]),
    ]
    const positions = Object.fromEntries(rank(entries, votes).map((row) => [row.entryId, row.position]))
    expect(positions).toEqual({ a: 1, b: 1, c: 3, d: 4 })
    // Misma puntuación: gana la de más votos.
    const tie = rank(
      [
        { id: 'pocos', submittedAt: 0 },
        { id: 'muchos', submittedAt: 1 },
      ],
      [...votesFor('pocos', [4, 4, 4]), ...votesFor('muchos', [4, 4, 4, 4, 4, 4])],
    )
    expect(tie.map((row) => row.entryId)).toEqual(['muchos', 'pocos'])
  })

  it('RF-RES-02: sin clasificar al final, en orden de subida; los votos a otras entradas no cuentan', () => {
    const entries = [
      { id: 'tarde', submittedAt: 30 },
      { id: 'pronto', submittedAt: 10 },
      { id: 'top', submittedAt: 20 },
    ]
    const result = rank(entries, [...votesFor('top', [5, 4, 5]), ...votesFor('retirada', [1, 1, 1, 1])])
    expect(result.map((row) => [row.entryId, row.position])).toEqual([
      ['top', 1],
      ['pronto', null],
      ['tarde', null],
    ])
  })

  it('RF-RES-04 / RF-RES-02: pura, total y estable: el orden de las entradas y de los votos no cambia nada', () => {
    const entryIds = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6']
    const arb = fc.record({
      votes: fc.array(
        fc.record({ entryId: fc.constantFrom(...entryIds), stars: fc.integer({ min: 1, max: 5 }) }),
        { maxLength: 80 },
      ),
      seed: fc.integer(),
    })
    fc.assert(
      fc.property(arb, ({ votes, seed }) => {
        const entries = entryIds.map((id, i) => ({ id, submittedAt: (i * 7919 + seed) % 97 }))
        const result = rank(entries, votes)
        // Total: una fila por entrada.
        expect(result.map((row) => row.entryId).sort()).toEqual(entryIds.slice().sort())
        // Estable: barajar entradas y votos da exactamente lo mismo.
        const shuffledVotes = votes.slice().reverse()
        const shuffledEntries = entries.slice().reverse()
        expect(rank(shuffledEntries, shuffledVotes)).toEqual(result)
        // Posiciones crecientes y sin huecos raros: cada posición es 1 + las que van delante con otra puntuación.
        const ranked = result.filter((row) => row.position !== null)
        ranked.forEach((row, i) => {
          expect(row.position).toBeLessThanOrEqual(i + 1)
          if (i > 0) expect(row.position).toBeGreaterThanOrEqual(ranked[i - 1]?.position ?? 0)
        })
        for (const row of result) {
          expect(row.histogram.reduce((a, b) => a + b, 0)).toBe(row.votes)
          if (row.position === null) expect(row.votes).toBeLessThan(3)
        }
      }),
    )
  })

  it('una semana sin votos: todas sin clasificar, puntuación 0', () => {
    const result = rank([{ id: 'x', submittedAt: 0 }], [])
    expect(result).toEqual([
      {
        entryId: 'x',
        position: null,
        scoreMilli: 0,
        votes: 0,
        meanMilli: 0,
        medianHalf: 0,
        histogram: [0, 0, 0, 0, 0],
        seasonPoints: 0,
      },
    ])
    expect(rank([], [])).toEqual([])
  })
})
