import { scheduleWeek } from '@beatbattle/rules'
import type { PublicWeek } from '@beatbattle/shared'
import { describe, expect, it } from 'vitest'
import {
  decodePeaks,
  menuWeekOf,
  musicalKeyName,
  nextBoundary,
  nextDropText,
  rangeText,
  whenText,
} from './weekModel'

const W41 = scheduleWeek({ year: 2026, month: 10, day: 5 })
const peaks = btoa(String.fromCharCode(0x81, 0x7f, 0xc0, 0x40))

const week: PublicWeek = {
  number: 41,
  slug: '2026-w41',
  label: '2026-W41',
  seasonId: '2026-T4',
  phase: 'open',
  ...W41,
  challenge: 'Usa solo el primer compás',
  golden: false,
  sample: {
    title: 'Lluvia en Gràcia',
    credits: 'Other People Records',
    origin: null,
    licenseText: 'Uso libre',
    bpm: 92,
    musicalKey: 'Dm',
    genreHint: 'Boom bap',
    durationMs: 72_000,
    peaks,
    chops: [],
    hasStems: false,
    coverUrl: '/cover',
    streamUrl: '/stream',
  },
  entries: 0,
  viewer: null,
}

describe('weekModel', () => {
  it('tonalidad en palabras', () => {
    expect(musicalKeyName('Dm')).toBe('Re menor')
    expect(musicalKeyName('F#')).toBe('Fa sostenido mayor')
    expect(musicalKeyName('A#m')).toBe('La sostenido menor')
  })

  it('la onda de la API (Int8 en base64) en pares de −1 a 1', () => {
    expect(decodePeaks(peaks)).toEqual([
      [-1, 1],
      [-64 / 127, 64 / 127],
    ])
  })

  it('rango y cierre en hora de Madrid', () => {
    expect(rangeText(week)).toBe('5–11 oct · 2026-\u2060W41')
    expect(rangeText({ ...scheduleWeek({ year: 2026, month: 9, day: 28 }), label: '2026-W40' })).toBe(
      '28 sept–4 oct · 2026-\u2060W40',
    )
    expect(whenText(W41.submitEndsAt, W41.startsAt)).toBe('domingo 11 a las 20:00')
    expect(whenText(W41.voteEndsAt - 1000, W41.submitEndsAt)).toBe('hoy a las 23:59')
    expect(nextDropText(W41.startsAt)).toBe('Cae el lunes 5 de octubre')
  })

  it('RF-DROP-10: en «open» cuenta hasta el cierre de envíos; en «voting», hasta el de votos', () => {
    const open = menuWeekOf(week, W41.startsAt + 1000)
    expect(open).toMatchObject({
      phase: 'open',
      number: 41,
      closesAt: W41.submitEndsAt,
      musicalKey: 'Re menor',
      durationSeconds: 72,
      clockWhen: 'Domingo 11 a las 20:00 · votos hasta las 23:59',
      weekBar: { today: 0 },
      streamUrl: '/stream',
    })
    const voting = menuWeekOf(week, W41.submitEndsAt)
    expect(voting).toMatchObject({ phase: 'voting', closesAt: W41.voteEndsAt })
    expect(menuWeekOf(week, W41.voteEndsAt)).toBeNull()
  })

  it('la home vuelve a pedir la semana en la siguiente frontera', () => {
    expect(nextBoundary({ week, next: null }, W41.startsAt)).toBe(W41.submitEndsAt)
    expect(nextBoundary({ week, next: null }, W41.submitEndsAt)).toBe(W41.voteEndsAt)
    expect(nextBoundary({ week: null, next: { startsAt: W41.startsAt } }, W41.startsAt - 5)).toBe(
      W41.startsAt,
    )
    expect(nextBoundary({ week: null, next: null }, 0)).toBeNull()
  })
})
