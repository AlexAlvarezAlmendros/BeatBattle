import { describe, expect, it } from 'vitest'
import {
  EntryListQuerySchema,
  ERROR_STATUS,
  ListedEntrySchema,
  ReportRequestSchema,
  TickerEventSchema,
  VoteRequestSchema,
} from '../src'

describe('esquemas del voto (§2.7, §4.10)', () => {
  it('RF-VOTE-01: estrellas enteras de 1 a 5; 0, 6 o 3.5 no pasan', () => {
    for (const stars of [1, 2, 3, 4, 5]) expect(VoteRequestSchema.safeParse({ stars }).success).toBe(true)
    for (const stars of [0, 6, 3.5, -1, '4', null])
      expect(VoteRequestSchema.safeParse({ stars }).success, String(stars)).toBe(false)
    expect(VoteRequestSchema.safeParse({ stars: 4, extra: 1 }).success).toBe(false)
  })

  it('códigos del voto con su estado HTTP (RF-VOTE-03, RF-VOTE-04, RF-VOTE-05, RF-VOTE-12)', () => {
    expect(ERROR_STATUS).toMatchObject({
      OWN_ENTRY: 403,
      LISTEN_REQUIRED: 409,
      VOTING_CLOSED: 409,
      REPORT_EXISTS: 409,
    })
  })

  it('RF-PLAY-04: la lista va en Ronda justa por defecto y no hay orden «mejor valoradas»', () => {
    expect(EntryListQuerySchema.parse({})).toEqual({ order: 'fair' })
    expect(EntryListQuerySchema.safeParse({ order: 'top' }).success).toBe(false)
    expect(EntryListQuerySchema.safeParse({ order: 'rating' }).success).toBe(false)
    expect(
      EntryListQuerySchema.parse({
        order: 'random',
        genre: 'Trap',
        bpm: '90-110',
        key: 'Am',
        unvoted: '1',
        seed: '7',
      }),
    ).toEqual({ order: 'random', genre: 'Trap', bpm: [90, 110], key: 'Am', unvoted: true, seed: 7 })
    expect(EntryListQuerySchema.safeParse({ bpm: '120-90' }).success).toBe(false)
    expect(EntryListQuerySchema.safeParse({ genre: 'Polka' }).success).toBe(false)
  })

  it('RF-PLAY-05: una entrada de la lista no tiene sitio para medias, recuentos ni posiciones', () => {
    const keys = Object.keys(ListedEntrySchema.shape)
    for (const banned of ['mean', 'average', 'score', 'votes', 'voteCount', 'position', 'rank', 'plays'])
      expect(keys).not.toContain(banned)
  })

  it('RF-VOTE-12: la denuncia lleva uno de los motivos y un detalle opcional de hasta 500 caracteres', () => {
    expect(ReportRequestSchema.parse({ reason: 'not_sample' })).toEqual({ reason: 'not_sample' })
    expect(ReportRequestSchema.parse({ reason: 'other', details: '  copia  ' })).toEqual({
      reason: 'other',
      details: 'copia',
    })
    expect(ReportRequestSchema.safeParse({ reason: 'feo' }).success).toBe(false)
    expect(ReportRequestSchema.safeParse({ reason: 'spam', details: 'x'.repeat(501) }).success).toBe(false)
  })

  it('RF-PLAY-05: la crónica no tiene sitio para la autoría', () => {
    expect(
      TickerEventSchema.safeParse({ kind: 'entry', id: 'e', alias: 'Tigre Púrpura', at: 1 }).success,
    ).toBe(true)
    expect(
      TickerEventSchema.safeParse({ kind: 'entry', id: 'e', alias: 'Tigre Púrpura', at: 1, producer: 'aina' })
        .success,
    ).toBe(false)
  })
})
