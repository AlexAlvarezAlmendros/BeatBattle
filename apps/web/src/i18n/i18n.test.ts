import { describe, expect, it } from 'vitest'
import es from './es.json'
import { createTranslator, DATE_FORMATS, formatDate, formatNumber, t } from './index'

const messages = {
  greeting: 'Hola, {name}',
  score: 'Media {value}',
  week: {
    entries_zero: 'Pista libre',
    entries_one: '{count} entrada',
    entries_other: '{count} entradas',
    votes_one: '{count} voto',
    votes_other: '{count} votos',
  },
} as const

const strict = createTranslator(messages, { strict: true })
const lenient = createTranslator(messages, { strict: false })

describe('i18n: t()', () => {
  it('traduce claves anidadas con puntos e interpola {variables}', () => {
    expect(strict('greeting', { name: 'Aina' })).toBe('Hola, Aina')
    expect(t('app.pageTitle', { page: 'Semanas' })).toBe('Semanas · Beat Battle')
    expect(t('app.name')).toBe('Beat Battle')
  })

  it('formatea en castellano los números interpolados', () => {
    expect(strict('score', { value: 4.25 })).toBe('Media 4,25')
    expect(strict('week.votes', { count: 12345 })).toBe('12.345 votos')
  })

  it('elige el plural con Intl.PluralRules("es") y la clave _zero si existe', () => {
    expect(strict('week.entries', { count: 0 })).toBe('Pista libre')
    expect(strict('week.entries', { count: 1 })).toBe('1 entrada')
    expect(strict('week.entries', { count: 2 })).toBe('2 entradas')
    expect(strict('week.entries', { count: 1.5 })).toBe('1,5 entradas')
    // Sin _zero, el 0 es «other» en castellano.
    expect(strict('week.votes', { count: 0 })).toBe('0 votos')
    // «many» (1 000 000) no tiene clave propia: cae en _other.
    expect(strict('week.votes', { count: 1_000_000 })).toBe('1.000.000 votos')
    expect(t('entries.count', { count: 3 })).toBe('3 entradas')
  })

  it('en desarrollo, una clave inexistente es un error', () => {
    // @ts-expect-error: la clave no existe, y el tipo de t() ya lo detecta
    expect(() => strict('nope')).toThrow(/No existe la clave «nope»/)
    // @ts-expect-error: tampoco existe en es.json
    expect(() => t('pages.nope')).toThrow(/No existe la clave/)
  })

  it('en producción, una clave inexistente muestra la propia clave', () => {
    // @ts-expect-error: clave inexistente a propósito
    expect(lenient('pages.nope')).toBe('pages.nope')
  })

  it('una variable que falta es un error en desarrollo y queda sin sustituir en producción', () => {
    expect(() => strict('greeting')).toThrow(/Falta la variable «name»/)
    expect(lenient('greeting')).toBe('Hola, {name}')
  })

  it('una clave de plural exige count (en tipos y en ejecución)', () => {
    // @ts-expect-error: falta count
    expect(() => strict('week.entries')).toThrow(/necesita la variable numérica «count»/)
    // @ts-expect-error: falta count
    expect(lenient('week.entries')).toBe('week.entries')
  })

  it('parts() devuelve los trozos en orden, con las variables tal cual (para meter elementos)', () => {
    const link = { element: 'a' }
    expect(strict.parts('greeting', { name: link })).toEqual(['Hola, ', link])
    expect(strict.parts('week.votes', { count: 12345 })).toEqual(['12.345', ' votos'])
    expect(t.parts('footer.credit', { brand: 'B', otherPeople: link })).toEqual(['B', ' · ', link])
    expect(() => strict.parts('greeting', {})).toThrow(/Falta la variable «name»/)
    expect(lenient.parts('greeting', {})).toEqual(['Hola, ', '{name}'])
    // @ts-expect-error: clave inexistente a propósito
    expect(() => strict.parts('nope', {})).toThrow(/No existe la clave «nope»/)
  })

  it('has() valida claves compuestas en tiempo de ejecución', () => {
    expect(strict.has('greeting')).toBe(true)
    expect(strict.has('week.entries')).toBe(true)
    expect(strict.has('week')).toBe(false)
    expect(strict.has('nope')).toBe(false)
  })

  it('rechaza hojas que no son texto', () => {
    expect(() => createTranslator({ a: 1 } as never, { strict: true })).toThrow(/no es un texto/)
  })
})

describe('i18n: es.json', () => {
  const leaves: [string, unknown][] = []
  const walk = (node: object, prefix: string) => {
    for (const [key, value] of Object.entries(node)) {
      if (value && typeof value === 'object') walk(value, `${prefix}${key}.`)
      else leaves.push([`${prefix}${key}`, value])
    }
  }
  walk(es, '')

  it('todas las hojas son textos no vacíos', () => {
    expect(leaves.length).toBeGreaterThan(0)
    for (const [key, value] of leaves) {
      expect(typeof value, key).toBe('string')
      expect((value as string).trim(), key).not.toBe('')
    }
  })

  it('las claves van en camelCase y el guion bajo solo marca plurales con su _other', () => {
    for (const [key] of leaves) {
      for (const segment of key.split('.')) {
        expect(segment, key).toMatch(/^[a-z][a-zA-Z0-9]*(?:_(?:zero|one|two|few|many|other))?$/)
      }
    }
    const pluralBases = new Set(
      leaves
        .map(([k]) => k)
        .filter((k) => /_[a-z]+$/.test(k))
        .map((k) => k.replace(/_[a-z]+$/, '')),
    )
    for (const base of pluralBases) {
      expect(t.has(base)).toBe(true)
      expect(
        leaves.some(([k]) => k === `${base}_other`),
        `${base}_other`,
      ).toBe(true)
    }
  })
})

describe('i18n: fechas y números', () => {
  // Domingo 11 de octubre de 2026, 18:00 UTC = 20:00 en Madrid (horario de verano, UTC+2).
  const sundayClose = Date.UTC(2026, 9, 11, 18, 0)

  it('formatDate usa es-ES y la hora de Madrid', () => {
    expect(formatDate(sundayClose)).toBe('11 de octubre de 2026')
    expect(formatDate(sundayClose, DATE_FORMATS.weekdayTime)).toBe('domingo 11, 20:00')
    expect(formatDate(sundayClose, DATE_FORMATS.time)).toBe('20:00')
    expect(formatDate(sundayClose, { weekday: 'long' })).toBe('domingo')
  })

  it('formatDate cambia de día según Madrid, no según UTC', () => {
    // 22:30 UTC del 11 ya es día 12 en Madrid.
    expect(formatDate(Date.UTC(2026, 9, 11, 22, 30), { day: 'numeric', month: 'long' })).toBe('12 de octubre')
  })

  it('formatDate sigue los cambios de hora de Madrid', () => {
    // 25/10/2026: a las 01:00 UTC se pasa de CEST (UTC+2) a CET (UTC+1).
    expect(formatDate(Date.UTC(2026, 9, 25, 0, 59), DATE_FORMATS.time)).toBe('02:59')
    expect(formatDate(Date.UTC(2026, 9, 25, 1, 0), DATE_FORMATS.time)).toBe('02:00')
    // 29/03/2026: a las 01:00 UTC se pasa de CET a CEST; las 02:xx no existen.
    expect(formatDate(Date.UTC(2026, 2, 29, 0, 59), DATE_FORMATS.time)).toBe('01:59')
    expect(formatDate(Date.UTC(2026, 2, 29, 1, 0), DATE_FORMATS.time)).toBe('03:00')
  })

  it('formatDate no acepta la zona por opciones ni instantes no válidos', () => {
    // @ts-expect-error: la zona es siempre Europe/Madrid
    formatDate(sundayClose, { timeZone: 'UTC' })
    // Y aunque se cuele saltándose el tipo, en ejecución manda Madrid (18:00 UTC = 20:00 en Madrid).
    expect(formatDate(sundayClose, { ...DATE_FORMATS.time, timeZone: 'UTC' } as never)).toBe('20:00')
    expect(() => formatDate(Number.NaN)).toThrow(RangeError)
  })

  it('formatNumber usa es-ES', () => {
    expect(formatNumber(12345.6)).toBe('12.345,6')
    expect(formatNumber(1000)).toBe('1000')
    expect(formatNumber(10000)).toBe('10.000')
    expect(formatNumber(4.256, { maximumFractionDigits: 2 })).toBe('4,26')
    expect(formatNumber(0.42, { style: 'percent' })).toMatch(/^42\s%$/u)
  })
})
