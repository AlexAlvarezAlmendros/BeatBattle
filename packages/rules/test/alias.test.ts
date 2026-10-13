import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  ALIAS_ADJECTIVES,
  ALIAS_COMBINATIONS,
  ALIAS_NOUNS,
  aliasAt,
  battleAlias,
  coverSeed,
  RECEIPT_MAX,
  receiptCode,
} from '../src/alias'

const entryId = fc.string({ minLength: 1, maxLength: 40 })

/** Asigna alias a `ids` en orden, como al crear las entradas de una semana una a una. */
function assignAll(ids: readonly string[]): string[] {
  const taken: string[] = []
  for (const id of ids) taken.push(battleAlias(id, taken))
  return taken
}

describe('battleAlias (§2.7, Anexo I)', () => {
  it('RF-VOTE-08: con 200 entradas en una semana no hay dos alias iguales', () => {
    const ids = Array.from({ length: 200 }, (_, i) => `entry-${i}`)
    const aliases = assignAll(ids)
    expect(new Set(aliases).size).toBe(200)
  })

  it('RF-VOTE-08: el mismo id con los mismos ocupados da siempre el mismo alias', () => {
    fc.assert(
      fc.property(entryId, fc.array(entryId, { maxLength: 30 }), (id, others) => {
        const taken = assignAll(others)
        expect(battleAlias(id, taken)).toBe(battleAlias(id, [...taken]))
        expect(battleAlias(id, new Set(taken))).toBe(battleAlias(id, taken))
      }),
    )
  })

  it('RF-VOTE-08: nunca devuelve un alias ocupado, en cualquier orden de llegada', () => {
    fc.assert(
      fc.property(fc.uniqueArray(entryId, { minLength: 1, maxLength: 120 }), (ids) => {
        const aliases = assignAll(ids)
        expect(new Set(aliases).size).toBe(ids.length)
      }),
    )
  })

  it('RF-VOTE-08: sin ocupados, el alias es el de su id (no depende de las demás entradas)', () => {
    fc.assert(
      fc.property(entryId, (id) => {
        expect(battleAlias(id)).toBe(battleAlias(id, []))
        expect(aliasAt(ALIAS_COMBINATIONS - 1)).toBeTypeOf('string')
      }),
    )
  })

  it('valores de referencia: cambiar el hash, las listas o su orden cambia los alias', () => {
    expect(battleAlias('entry-1')).toMatchInlineSnapshot(`"Sombra Helada"`)
    expect(battleAlias('entry-2')).toMatchInlineSnapshot(`"Avispa Violeta"`)
    expect(battleAlias('01J9ZB6Q4W3K8X2N5M7P0R1T6V')).toMatchInlineSnapshot(`"Fénix Indomable"`)
    expect(aliasAt(0)).toBe('Tigre Púrpura')
  })

  it('el adjetivo concuerda con el género del sustantivo', () => {
    for (let index = 0; index < ALIAS_COMBINATIONS; index++) {
      const alias = aliasAt(index)
      const n = ALIAS_NOUNS[index % ALIAS_NOUNS.length]!
      const adjective = ALIAS_ADJECTIVES[Math.floor(index / ALIAS_NOUNS.length)]!
      expect(alias).toBe(`${n.word} ${n.gender === 'm' ? adjective.m : adjective.f}`)
    }
    expect(aliasAt(ALIAS_NOUNS.findIndex((n) => n.word === 'Pantera') + 4 * ALIAS_NOUNS.length)).toBe(
      'Pantera Dorada',
    )
  })

  it('Anexo I: al menos 60 × 60 combinaciones, sin repetir palabras, en mayúscula inicial y de una palabra', () => {
    expect(ALIAS_NOUNS.length).toBeGreaterThanOrEqual(60)
    expect(ALIAS_ADJECTIVES.length).toBeGreaterThanOrEqual(60)
    expect(new Set(ALIAS_NOUNS.map((n) => n.word)).size).toBe(ALIAS_NOUNS.length)
    expect(new Set(ALIAS_ADJECTIVES.map((a) => a.m)).size).toBe(ALIAS_ADJECTIVES.length)
    const words = [...ALIAS_NOUNS.map((n) => n.word), ...ALIAS_ADJECTIVES.flatMap((a) => [a.m, a.f])]
    for (const word of words) expect(word, word).toMatch(/^\p{Lu}\p{Ll}+$/u)
  })

  it('las 4000+ combinaciones son distintas y el recorrido las visita todas', () => {
    const all = new Set(Array.from({ length: ALIAS_COMBINATIONS }, (_, i) => aliasAt(i)))
    expect(all.size).toBe(ALIAS_COMBINATIONS)
    expect(() => battleAlias('lleno', all)).toThrow(RangeError)
    const missing = [...all][1234]!
    const almost = new Set(all)
    almost.delete(missing)
    expect(battleAlias('casi-lleno', almost)).toBe(missing)
  })

  it('rechaza un id vacío y un índice fuera de rango', () => {
    expect(() => battleAlias('')).toThrow(RangeError)
    expect(() => aliasAt(-1)).toThrow(RangeError)
    expect(() => aliasAt(ALIAS_COMBINATIONS)).toThrow(RangeError)
  })
})

describe('receiptCode (§2.12.1)', () => {
  it('RF-NOTIF-06 (parcial: formato del número): «BB-2026W41-0007»', () => {
    expect(receiptCode('2026-W41', 7)).toBe('BB-2026W41-0007')
    expect(receiptCode('2027-W01', 1)).toBe('BB-2027W01-0001')
    expect(receiptCode('2026-W53', RECEIPT_MAX)).toBe('BB-2026W53-9999')
  })

  it('es inyectivo dentro de la semana y siempre tiene la misma forma', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: RECEIPT_MAX }),
        fc.integer({ min: 1, max: RECEIPT_MAX }),
        (a, b) => {
          const codeA = receiptCode('2026-W41', a)
          expect(codeA).toMatch(/^BB-2026W41-\d{4}$/)
          expect(codeA === receiptCode('2026-W41', b)).toBe(a === b)
        },
      ),
    )
  })

  it('rechaza semanas mal escritas y números fuera de rango', () => {
    expect(() => receiptCode('2026-w41', 1)).toThrow(RangeError)
    expect(() => receiptCode('2026W41', 1)).toThrow(RangeError)
    expect(() => receiptCode('2026-W41', 0)).toThrow(RangeError)
    expect(() => receiptCode('2026-W41', RECEIPT_MAX + 1)).toThrow(RangeError)
    expect(() => receiptCode('2026-W41', 1.5)).toThrow(RangeError)
  })
})

describe('coverSeed (§3.4.5)', () => {
  it('RD-VIS-04 (parcial: semilla): estable por id y entero de 32 bits', () => {
    fc.assert(
      fc.property(entryId, (id) => {
        const seed = coverSeed(id)
        expect(seed).toBe(coverSeed(id))
        expect(Number.isInteger(seed)).toBe(true)
        expect(seed).toBeGreaterThanOrEqual(0)
        expect(seed).toBeLessThan(2 ** 32)
      }),
    )
  })

  it('no coincide con el hash del alias (flujos con nombre distintos)', () => {
    expect(coverSeed('entry-1')).not.toBe(coverSeed('entry-2'))
    expect(() => coverSeed('')).toThrow(RangeError)
  })
})
