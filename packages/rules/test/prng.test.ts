import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  createRng,
  cyrb53,
  hash32,
  hashOf,
  rngFor,
  type SeedPart,
  seedKey,
  seedState,
  sfc32,
} from '../src/prng'

const seedPart = fc.oneof(fc.string(), fc.integer())

function take(next: () => number, n: number): number[] {
  return Array.from({ length: n }, () => next())
}

describe('hashes de cadenas', () => {
  it('cyrb53 coincide con los valores publicados por su autor', () => {
    expect(cyrb53('a')).toBe(7929297801672961)
    expect(cyrb53('b')).toBe(8684336938537663)
    expect(cyrb53('revenge')).toBe(4051478007546757)
    expect(cyrb53('revenue')).toBe(8309097637345594)
  })

  it('hash32 son los 32 bits bajos de cyrb53', () => {
    fc.assert(
      fc.property(fc.string(), fc.integer({ min: 0, max: 2 ** 31 - 1 }), (text, seed) => {
        const h = hash32(text, seed)
        expect(Number.isInteger(h) && h >= 0 && h < 2 ** 32).toBe(true)
        expect(h).toBe(cyrb53(text, seed) % 2 ** 32)
      }),
    )
  })

  it('seedState da cuatro enteros sin signo de 32 bits', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const state = seedState(text)
        expect(state).toHaveLength(4)
        for (const word of state) expect(Number.isInteger(word) && word >= 0 && word < 2 ** 32).toBe(true)
      }),
    )
  })
})

describe('sfc32', () => {
  it('es determinista y devuelve enteros sin signo de 32 bits', () => {
    const a = take(sfc32([1, 2, 3, 4]), 100)
    const b = take(sfc32([1, 2, 3, 4]), 100)
    expect(a).toEqual(b)
    for (const x of a) expect(Number.isInteger(x) && x >= 0 && x < 2 ** 32).toBe(true)
    expect(new Set(a).size).toBe(100)
  })

  it('acepta palabras de estado por encima de 2^31 sin perder determinismo', () => {
    const state = [0xffffffff, 0x80000000, 0xdeadbeef, 0x12345678] as const
    expect(take(sfc32(state), 20)).toEqual(take(sfc32(state), 20))
  })
})

describe('createRng y rngFor', () => {
  // Valores de referencia, contrastados con una implementación independiente de cyrb128 + sfc32 en
  // JavaScript plano. Si cambian, cambian todos los barajados y alias ya publicados: no se
  // actualizan sin decidirlo (y anotarlo en la guía).
  it('fija la secuencia de referencia', () => {
    expect(seedState('beatbattle')).toEqual([197807361, 1186084135, 4234181195, 1589487065])
    expect(seedKey('beatbattle')).toBe('10:beatbattle')
    expect(seedState('10:beatbattle')).toEqual([1959096902, 2259811218, 1423117228, 2940796167])
    const rng = createRng('beatbattle')
    expect(take(() => rng.nextUint32(), 5)).toEqual([
      1515471754, 3375959352, 3961152789, 2335660845, 1000796243,
    ])
    const fair = rngFor('fair', 'user-1', 'week-1')
    expect(take(() => fair.nextUint32(), 3)).toEqual([3246221223, 2744428561, 3444118745])
    expect(hashOf('user-1', 'week-1', 'entry-1')).toBe(2108093989)
    expect(createRng('shuffle').shuffle([1, 2, 3, 4, 5, 6, 7, 8])).toEqual([7, 1, 4, 5, 8, 3, 2, 6])
  })

  it('misma semilla, misma secuencia', () => {
    fc.assert(
      fc.property(seedPart, (seed) => {
        const a = createRng(seed)
        const b = createRng(seed)
        expect(take(() => a.next(), 32)).toEqual(take(() => b.next(), 32))
      }),
    )
  })

  it('semillas distintas dan secuencias distintas', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (s1, s2) => {
        fc.pre(s1 !== s2)
        const a = createRng(s1)
        const b = createRng(s2)
        expect(take(() => a.nextUint32(), 4)).not.toEqual(take(() => b.nextUint32(), 4))
      }),
    )
  })

  it('createRng(semilla) es rngFor(semilla): un único camino de siembra', () => {
    fc.assert(
      fc.property(seedPart, (seed) => {
        const a = createRng(seed)
        const b = rngFor(seed)
        expect(take(() => a.nextUint32(), 16)).toEqual(take(() => b.nextUint32(), 16))
      }),
    )
  })

  it('una semilla numérica equivale a su texto', () => {
    expect(take(() => createRng(42).nextUint32(), 8)).toEqual(take(() => createRng('42').nextUint32(), 8))
  })

  it('rngFor no confunde partes concatenadas', () => {
    expect(seedKey('ab', 'c')).not.toBe(seedKey('a', 'bc'))
    expect(seedKey('a|b')).not.toBe(seedKey('a', 'b'))
    const a = rngFor('ab', 'c')
    const b = rngFor('a', 'bc')
    expect(take(() => a.nextUint32(), 4)).not.toEqual(take(() => b.nextUint32(), 4))
    expect(hashOf('ab', 'c')).not.toBe(hashOf('a', 'bc'))
  })

  it('los flujos con nombre son independientes del orden en que se consumen', () => {
    const alone = take(() => rngFor('alias', 'week-1').nextUint32(), 1)
    const other = rngFor('fair', 'week-1')
    take(() => other.next(), 1000)
    expect(take(() => rngFor('alias', 'week-1').nextUint32(), 1)).toEqual(alone)
  })

  it('rechaza semillas imposibles', () => {
    expect(() => createRng(Number.NaN)).toThrow(RangeError)
    expect(() => rngFor()).toThrow(RangeError)
    expect(() => hashOf()).toThrow(RangeError)
    expect(() => hashOf(...([] as SeedPart[]))).toThrow(RangeError)
    expect(() => seedKey()).toThrow(RangeError)
    expect(() => rngFor('x', Number.POSITIVE_INFINITY)).toThrow(RangeError)
    expect(() => seedKey(Number.NaN as SeedPart)).toThrow(RangeError)
  })
})

describe('next()', () => {
  it('siempre en [0, 1)', () => {
    fc.assert(
      fc.property(seedPart, (seed) => {
        const rng = createRng(seed)
        for (let i = 0; i < 200; i++) {
          const x = rng.next()
          expect(x >= 0 && x < 1).toBe(true)
        }
      }),
    )
  })

  it('reparte de forma razonable: χ² de 10 cubetas con 100 000 muestras', () => {
    const rng = createRng('distribución')
    const buckets = new Array<number>(10).fill(0)
    const samples = 100_000
    for (let i = 0; i < samples; i++) {
      const k = Math.floor(rng.next() * 10)
      buckets[k] = (buckets[k] as number) + 1
    }
    const expected = samples / 10
    const chi2 = buckets.reduce((acc, observed) => acc + (observed - expected) ** 2 / expected, 0)
    // 9 grados de libertad: p = 0,001 en χ² ≈ 27,9. Con semilla fija el test es determinista.
    expect(chi2).toBeLessThan(27.9)
    expect(rng.next()).toBeLessThan(1)
  })
})

describe('int(min, max)', () => {
  it('siempre es un entero en [min, max], ambos incluidos', () => {
    fc.assert(
      fc.property(
        seedPart,
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000 }),
        (seed, min, width) => {
          const rng = createRng(seed)
          const max = min + width
          for (let i = 0; i < 50; i++) {
            const x = rng.int(min, max)
            expect(Number.isInteger(x) && x >= min && x <= max).toBe(true)
          }
        },
      ),
    )
  })

  it('alcanza los dos extremos y reparte por igual (dado de 6 caras)', () => {
    const rng = createRng('dado')
    const counts = new Array<number>(7).fill(0)
    const rolls = 60_000
    for (let i = 0; i < rolls; i++) {
      const face = rng.int(1, 6)
      counts[face] = (counts[face] as number) + 1
    }
    expect(counts[0]).toBe(0)
    const faces = counts.slice(1)
    const expected = rolls / 6
    const chi2 = faces.reduce((acc, observed) => acc + (observed - expected) ** 2 / expected, 0)
    // 5 grados de libertad: p = 0,001 en χ² ≈ 20,5.
    expect(chi2).toBeLessThan(20.5)
  })

  it('con min = max devuelve siempre ese valor', () => {
    const rng = createRng('fijo')
    expect(take(() => rng.int(7, 7), 10)).toEqual(new Array(10).fill(7))
  })

  it('rechaza rangos imposibles', () => {
    const rng = createRng('errores')
    expect(() => rng.int(5, 4)).toThrow(RangeError)
    expect(() => rng.int(0.5, 4)).toThrow(RangeError)
    expect(() => rng.int(0, Number.NaN)).toThrow(RangeError)
    expect(() => rng.int(0, 2 ** 32)).toThrow(RangeError)
    expect(() => rng.int(0, 2 ** 32 - 1)).not.toThrow()
  })
})

describe('pick y shuffle', () => {
  it('pick devuelve un elemento de la lista', () => {
    fc.assert(
      fc.property(seedPart, fc.array(fc.integer(), { minLength: 1 }), (seed, items) => {
        expect(items).toContain(createRng(seed).pick(items))
      }),
    )
  })

  it('pick rechaza una lista vacía', () => {
    expect(() => createRng('vacía').pick([])).toThrow(RangeError)
  })

  it('shuffle devuelve una permutación y no toca la lista original', () => {
    fc.assert(
      fc.property(seedPart, fc.array(fc.integer()), (seed, items) => {
        const before = items.slice()
        const shuffled = createRng(seed).shuffle(items)
        expect(items).toEqual(before)
        expect(shuffled).not.toBe(items)
        expect(shuffled.slice().sort((a, b) => a - b)).toEqual(before.slice().sort((a, b) => a - b))
      }),
    )
  })

  it('shuffle es determinista por semilla', () => {
    fc.assert(
      fc.property(seedPart, fc.array(fc.integer()), (seed, items) => {
        expect(createRng(seed).shuffle(items)).toEqual(createRng(seed).shuffle(items))
      }),
    )
  })

  it('shuffle reparte cada elemento por igual en cada posición (Fisher–Yates sin sesgo)', () => {
    const rng = createRng('fisher-yates')
    const n = 4
    const rounds = 24_000
    const counts = Array.from({ length: n }, () => new Array<number>(n).fill(0))
    for (let r = 0; r < rounds; r++) {
      rng.shuffle([0, 1, 2, 3]).forEach((value, position) => {
        const row = counts[value] as number[]
        row[position] = (row[position] as number) + 1
      })
    }
    const expected = rounds / n
    for (const row of counts) {
      for (const observed of row) expect(Math.abs(observed - expected) / expected).toBeLessThan(0.05)
    }
  })
})
