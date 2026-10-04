import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { fixedClock } from '../src/lib/clock'
import { createUuidV7, isUuidV7, uuidv7, uuidv7Time } from '../src/lib/ids'
import { T0 } from './helpers'

const FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('uuidv7', () => {
  it('tiene el formato de la versión 7 y la variante RFC 9562', () => {
    for (let i = 0; i < 200; i++) {
      const id = uuidv7(T0 + i)
      expect(id).toMatch(FORMAT)
      expect(isUuidV7(id)).toBe(true)
      // versión en el nibble alto del byte 6 y variante 10xx en el byte 8
      const hex = id.replaceAll('-', '')
      expect(Number.parseInt(hex[12]!, 16)).toBe(7)
      expect(Number.parseInt(hex[16]!, 16) >> 2).toBe(0b10)
    }
  })

  it('codifica el instante del reloj inyectado (número o Clock)', () => {
    const gen = createUuidV7()
    expect(uuidv7Time(gen(T0))).toBe(T0)
    const clock = fixedClock(T0 + 123_456)
    expect(uuidv7Time(gen(clock))).toBe(T0 + 123_456)
    expect(uuidv7Time(createUuidV7()(0))).toBe(0)
    expect(uuidv7Time(createUuidV7()(2 ** 48 - 1))).toBe(2 ** 48 - 1)
  })

  it('se ordena por tiempo entre milisegundos distintos', () => {
    const gen = createUuidV7()
    const ids = [T0 + 5, T0 + 1_000, T0 + 86_400_000, T0 + 31_536_000_000].map((t) => gen(t))
    expect([...ids].sort()).toEqual(ids)
  })

  it('es monótono dentro del mismo milisegundo (reloj fijo)', () => {
    const gen = createUuidV7()
    const clock = fixedClock(T0)
    const ids = Array.from({ length: 5_000 }, () => gen(clock))
    expect(new Set(ids).size).toBe(ids.length)
    for (let i = 1; i < ids.length; i++) expect(ids[i]! > ids[i - 1]!).toBe(true)
  })

  it('al desbordar el contador avanza 1 ms y sigue ordenado', () => {
    // fuente aleatoria que deja el contador en su máximo inicial (0x7ff)
    const gen = createUuidV7(() => {
      const b = randomBytes(16)
      b[6] = 0xff
      b[7] = 0xff
      return b
    })
    const ids = Array.from({ length: 0x1000 }, () => gen(T0))
    for (let i = 1; i < ids.length; i++) expect(ids[i]! > ids[i - 1]!).toBe(true)
    expect(uuidv7Time(ids[0]!)).toBe(T0)
    expect(uuidv7Time(ids.at(-1)!)).toBe(T0 + 1)
  })

  it('un retroceso pequeño del reloj no rompe el orden; uno grande usa su instante', () => {
    const gen = createUuidV7()
    const a = gen(T0)
    const b = gen(T0 - 3)
    expect(b > a).toBe(true)
    const c = gen(T0 - 86_400_000)
    expect(uuidv7Time(c)).toBe(T0 - 86_400_000)
  })

  it('no repite ids entre generadores (parte aleatoria de 62 bits)', () => {
    const ids = new Set(Array.from({ length: 2_000 }, () => createUuidV7()(T0)))
    expect(ids.size).toBe(2_000)
  })

  it('rechaza instantes imposibles', () => {
    for (const bad of [-1, 1.5, Number.NaN, 2 ** 48]) expect(() => uuidv7(bad)).toThrow(RangeError)
    expect(() => uuidv7Time('no-es-un-uuid')).toThrow(TypeError)
    expect(isUuidV7('00000000-0000-4000-8000-000000000000')).toBe(false)
  })
})
