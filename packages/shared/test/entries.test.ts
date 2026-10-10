import { describe, expect, it } from 'vitest'
import {
  BEAT_GENRES,
  ENTRY_COVER_MAX_BYTES,
  EntryAudioReplaceSchema,
  EntryCreateSchema,
  EntryUpdateSchema,
  ERROR_STATUS,
  OwnEntrySchema,
  PublicEntrySchema,
  UploadSignRequestSchema,
} from '../src'

const ficha = {
  intentId: 'intent-1',
  title: 'Lluvia en Gràcia flip',
  bpm: 140,
  musicalKey: 'Am',
  daw: 'FL Studio',
  genres: ['Trap', 'Drill'],
  description: null,
  declaration: true,
} as const

const publicEntry = {
  id: 'e1',
  weekSlug: '2026-w41',
  alias: 'Tigre Púrpura',
  title: 'Lluvia en Gràcia flip',
  description: null,
  bpm: 140,
  musicalKey: 'Am',
  daw: null,
  genres: ['Trap'],
  durationMs: 150_000,
  peaks: null,
  gainDb: -4.8,
  streamUrl: 'https://res.cloudinary.com/x/video/authenticated/s--sig--/f_mp3,br_192k/a.mp3',
  cover: { kind: 'generative', seed: 1234 },
  producer: null,
} as const

describe('EntryCreateSchema (§2.5, §4.8.2)', () => {
  it('acepta la ficha con la declaración y el intent', () => {
    expect(EntryCreateSchema.parse(ficha).title).toBe('Lluvia en Gràcia flip')
  })

  it('RF-ENT-05: no acepta metadatos de integridad del cliente (duración, bytes, formato, sonoridad, onda)', () => {
    for (const extra of [
      { durationMs: 60_000 },
      { duration: 60 },
      { bytes: 1 },
      { format: 'wav' },
      { loudnessLufs: -14 },
      { peaks: 'AAAA' },
      { etag: 'x' },
    ]) {
      expect(EntryCreateSchema.safeParse({ ...ficha, ...extra }).success, JSON.stringify(extra)).toBe(false)
    }
  })

  it('el título va de 2 a 60 caracteres, sin contar los espacios de los lados', () => {
    expect(EntryCreateSchema.safeParse({ ...ficha, title: 'A' }).success).toBe(false)
    expect(EntryCreateSchema.safeParse({ ...ficha, title: '  AB  ' }).data?.title).toBe('AB')
    expect(EntryCreateSchema.safeParse({ ...ficha, title: 'x'.repeat(60) }).success).toBe(true)
    expect(EntryCreateSchema.safeParse({ ...ficha, title: 'x'.repeat(61) }).success).toBe(false)
  })

  it('hasta 3 géneros de la lista del sello, sin repetir', () => {
    expect(EntryCreateSchema.safeParse({ ...ficha, genres: BEAT_GENRES.slice(0, 3) }).success).toBe(true)
    expect(EntryCreateSchema.safeParse({ ...ficha, genres: BEAT_GENRES.slice(0, 4) }).success).toBe(false)
    expect(EntryCreateSchema.safeParse({ ...ficha, genres: ['Trap', 'Trap'] }).success).toBe(false)
    expect(EntryCreateSchema.safeParse({ ...ficha, genres: ['Polka'] }).success).toBe(false)
  })

  it('la declaración es obligatoria y la descripción no pasa de 280', () => {
    expect(EntryCreateSchema.safeParse({ ...ficha, declaration: false }).success).toBe(false)
    const { declaration: _, ...withoutDeclaration } = ficha
    expect(EntryCreateSchema.safeParse(withoutDeclaration).success).toBe(false)
    expect(EntryCreateSchema.safeParse({ ...ficha, description: 'x'.repeat(280) }).success).toBe(true)
    expect(EntryCreateSchema.safeParse({ ...ficha, description: 'x'.repeat(281) }).success).toBe(false)
  })

  it('el DAW es uno de la lista o el que se escriba en «otro» (hasta 40)', () => {
    expect(EntryCreateSchema.safeParse({ ...ficha, daw: 'Renoise' }).success).toBe(true)
    expect(EntryCreateSchema.safeParse({ ...ficha, daw: 'x'.repeat(41) }).success).toBe(false)
  })
})

describe('edición y sustitución (§2.5)', () => {
  it('PATCH: solo lo que cambia; la portada propia se quita con null', () => {
    expect(EntryUpdateSchema.parse({ title: 'Otro título' })).toEqual({ title: 'Otro título' })
    expect(EntryUpdateSchema.parse({ coverIntentId: null })).toEqual({ coverIntentId: null })
    expect(EntryUpdateSchema.safeParse({ durationMs: 1 }).success).toBe(false)
    expect(EntryUpdateSchema.safeParse({ declaration: true }).success).toBe(false)
  })

  it('RF-ENT-08 (parcial: contrato): sustituir el audio solo lleva el intent nuevo', () => {
    expect(EntryAudioReplaceSchema.parse({ intentId: 'i2' })).toEqual({ intentId: 'i2' })
    expect(EntryAudioReplaceSchema.safeParse({ intentId: 'i2', durationMs: 1 }).success).toBe(false)
  })
})

describe('firma de la subida (§4.8.2)', () => {
  it('RF-ENT-04: la firma de una entrada no deja elegir el public_id ni la carpeta', () => {
    const request = {
      kind: 'entry',
      weekSlug: '2026-w41',
      mime: 'audio/wav',
      bytes: 60_000_000,
      durationMs: 150_000,
    }
    expect(UploadSignRequestSchema.parse(request).kind).toBe('entry')
    expect(
      UploadSignRequestSchema.safeParse({ ...request, publicId: 'beatbattle/entries/x/mio' }).success,
    ).toBe(false)
    expect(UploadSignRequestSchema.safeParse({ ...request, folder: 'x' }).success).toBe(false)
    expect(UploadSignRequestSchema.safeParse({ ...request, mime: 'video/mp4' }).success).toBe(false)
  })

  it('la portada propia: imagen de hasta 10 MB', () => {
    const cover = {
      kind: 'entryCover',
      weekSlug: '2026-w41',
      mime: 'image/png',
      bytes: ENTRY_COVER_MAX_BYTES,
    }
    expect(UploadSignRequestSchema.safeParse(cover).success).toBe(true)
    expect(UploadSignRequestSchema.safeParse({ ...cover, bytes: ENTRY_COVER_MAX_BYTES + 1 }).success).toBe(
      false,
    )
  })

  it('el avatar sigue igual', () => {
    expect(
      UploadSignRequestSchema.safeParse({ kind: 'avatar', mime: 'image/png', bytes: 1000 }).success,
    ).toBe(true)
  })
})

describe('entrada pública y propia (§4.10)', () => {
  it('RF-ENT-10: la entrada pública en ciego no admite campos de autoría ni la portada propia', () => {
    expect(PublicEntrySchema.parse(publicEntry).producer).toBeNull()
    for (const leak of [
      { userId: 'u1' },
      { username: 'kairo' },
      { avatar: 'https://x' },
      { avatarUrl: 'https://x' },
      { coverUrl: 'https://x/own.png' },
      { ownCoverUrl: 'https://x/own.png' },
      { audioPublicId: 'beatbattle/entries/2026-w41/abc' },
    ]) {
      expect(PublicEntrySchema.safeParse({ ...publicEntry, ...leak }).success, JSON.stringify(leak)).toBe(
        false,
      )
    }
  })

  it('RNF-SEC-04 (parcial: contrato): sin medias, recuentos de votos ni posiciones', () => {
    for (const leak of [
      { average: 4.2 },
      { votes: 12 },
      { voteCount: 12 },
      { position: 1 },
      { score: 4.6 },
    ]) {
      expect(PublicEntrySchema.safeParse({ ...publicEntry, ...leak }).success, JSON.stringify(leak)).toBe(
        false,
      )
      expect(
        OwnEntrySchema.safeParse({
          ...publicEntry,
          status: 'active',
          receiptCode: 'BB-2026W41-0007',
          format: 'wav',
          bytes: 60_000_000,
          loudnessLufs: -9.2,
          truePeakDb: -0.3,
          ownCoverUrl: null,
          canReplaceAudio: true,
          submittedAt: 1,
          updatedAt: 1,
          ...leak,
        }).success,
        JSON.stringify(leak),
      ).toBe(false)
    }
  })
})

describe('códigos de error de la Fase 4 (§4.10)', () => {
  it('RF-ENT-01, RF-ENT-02, RF-ENT-08: 409 con su código propio', () => {
    expect(ERROR_STATUS.ENTRY_EXISTS).toBe(409)
    expect(ERROR_STATUS.SUBMISSIONS_CLOSED).toBe(409)
    expect(ERROR_STATUS.ENTRY_HAS_VOTES).toBe(409)
    expect(ERROR_STATUS.UPLOAD_INTENT_INVALID).toBe(409)
    expect(ERROR_STATUS.ENTRY_ASSET_INVALID).toBe(422)
  })
})
