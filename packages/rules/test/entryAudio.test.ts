import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { ENTRY_MAX_BYTES, ENTRY_MAX_DURATION_MS, ENTRY_MIN_DURATION_MS } from '../src/balance'
import { entryFormatOf, validateEntryAudio } from '../src/entryAudio'

const MB = 1024 * 1024
const ok = { format: 'mp3', sizeBytes: 8 * MB, durationMs: 3 * 60_000 } as const

describe('validateEntryAudio', () => {
  it('RF-ENT-03 (parcial: regla pura; la subida llega en la Fase 4): un MP3 de 5 min se rechaza por duración y dice cuánto dura y el máximo', () => {
    expect(validateEntryAudio({ ...ok, durationMs: 5 * 60_000 })).toEqual({
      code: 'DURATION_OUT_OF_RANGE',
      durationMs: 300_000,
      limit: 'max',
      limitMs: 240_000,
    })
  })

  it('RF-ENT-03 (parcial: regla pura; la subida llega en la Fase 4): de 30 s a 4 min, con los dos límites incluidos', () => {
    expect(validateEntryAudio({ ...ok, durationMs: ENTRY_MAX_DURATION_MS })).toBeNull()
    expect(validateEntryAudio({ ...ok, durationMs: ENTRY_MAX_DURATION_MS + 1 })?.code).toBe(
      'DURATION_OUT_OF_RANGE',
    )
    expect(validateEntryAudio({ ...ok, durationMs: ENTRY_MIN_DURATION_MS })).toBeNull()
    expect(validateEntryAudio({ ...ok, durationMs: ENTRY_MIN_DURATION_MS - 1 })).toEqual({
      code: 'DURATION_OUT_OF_RANGE',
      durationMs: 29_999,
      limit: 'min',
      limitMs: 30_000,
    })
  })

  it('RF-ENT-03 (parcial: regla pura; la subida llega en la Fase 4): hasta 100 MiB y solo WAV, AIFF, FLAC o MP3', () => {
    expect(validateEntryAudio({ ...ok, sizeBytes: ENTRY_MAX_BYTES })).toBeNull()
    expect(validateEntryAudio({ ...ok, sizeBytes: ENTRY_MAX_BYTES + 1 })).toEqual({
      code: 'FILE_TOO_LARGE',
      sizeBytes: ENTRY_MAX_BYTES + 1,
      maxBytes: ENTRY_MAX_BYTES,
    })
    expect(validateEntryAudio({ ...ok, format: null })).toEqual({ code: 'UNSUPPORTED_FORMAT' })
  })

  it('comprueba en el orden del navegador: formato, tamaño y duración', () => {
    const everythingWrong = { format: null, sizeBytes: ENTRY_MAX_BYTES + 1, durationMs: 10 * 60_000 }
    expect(validateEntryAudio(everythingWrong)?.code).toBe('UNSUPPORTED_FORMAT')
    expect(validateEntryAudio({ ...everythingWrong, format: 'wav' })?.code).toBe('FILE_TOO_LARGE')
  })

  it('acepta toda duración dentro del rango y rechaza toda la de fuera', () => {
    fc.assert(
      fc.property(fc.nat(20 * 60_000), (durationMs) => {
        const inside = durationMs >= ENTRY_MIN_DURATION_MS && durationMs <= ENTRY_MAX_DURATION_MS
        expect(validateEntryAudio({ ...ok, durationMs }) === null).toBe(inside)
      }),
    )
  })

  it('rechaza medidas imposibles', () => {
    expect(() => validateEntryAudio({ ...ok, durationMs: Number.NaN })).toThrow(RangeError)
    expect(() => validateEntryAudio({ ...ok, sizeBytes: -1 })).toThrow(RangeError)
  })
})

describe('entryFormatOf', () => {
  it('reconoce la extensión sin distinguir mayúsculas (aif y aiff son AIFF)', () => {
    expect(entryFormatOf('mi flip.WAV')).toBe('wav')
    expect(entryFormatOf('flip.final.aif')).toBe('aiff')
    expect(entryFormatOf('flip.aiff')).toBe('aiff')
    expect(entryFormatOf('flip.flac')).toBe('flac')
    expect(entryFormatOf('flip.Mp3')).toBe('mp3')
  })

  it('cualquier otra cosa no se admite', () => {
    expect(entryFormatOf('flip.ogg')).toBeNull()
    expect(entryFormatOf('flip.m4a')).toBeNull()
    expect(entryFormatOf('flip')).toBeNull()
    expect(entryFormatOf('flip.mp3.zip')).toBeNull()
  })
})
