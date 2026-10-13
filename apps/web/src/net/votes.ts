import {
  type EntryList,
  type EntryListQuery,
  EntryListSchema,
  type EntryStats,
  EntryStatsSchema,
  type JuryQueue,
  JuryQueueSchema,
  type MyVotes,
  MyVotesSchema,
  type PublicEntry,
  PublicEntrySchema,
  type ReportRequest,
  type Ticker,
  TickerSchema,
  type Vote,
  VoteSchema,
} from '@beatbattle/shared'
import { z } from 'zod'
import { apiFetch } from './api'

/**
 * Escuchar y votar (§4.10; Fase 5): la lista de la semana, la ficha, la cola del Modo Jurado, la crónica,
 * el voto y la denuncia. El recibo de escucha y las escuchas los pide el reproductor (`features/player/listen`).
 */

/** Los filtros de la lista en la URL (`bpm` como «min-max»). */
export function entryListSearch(query: Partial<EntryListQuery>): string {
  const params = new URLSearchParams()
  if (query.order && query.order !== 'fair') params.set('order', query.order)
  if (query.genre) params.set('genre', query.genre)
  if (query.bpm) params.set('bpm', `${query.bpm[0]}-${query.bpm[1]}`)
  if (query.key) params.set('key', query.key)
  if (query.unvoted) params.set('unvoted', '1')
  if (query.seed !== undefined) params.set('seed', String(query.seed))
  const text = params.toString()
  return text ? `?${text}` : ''
}

export function listEntries(
  slug: string,
  query: Partial<EntryListQuery>,
  signal?: AbortSignal,
): Promise<EntryList> {
  return apiFetch(`/api/weeks/${encodeURIComponent(slug)}/entries${entryListSearch(query)}`, {
    schema: EntryListSchema,
    signal,
  })
}

export function getEntry(id: string, signal?: AbortSignal): Promise<PublicEntry> {
  return apiFetch(`/api/entries/${encodeURIComponent(id)}`, { schema: PublicEntrySchema, signal })
}

export function juryQueue(week?: string, signal?: AbortSignal): Promise<JuryQueue> {
  return apiFetch(`/api/jury/queue${week ? `?week=${encodeURIComponent(week)}` : ''}`, {
    schema: JuryQueueSchema,
    signal,
  })
}

export function myVotes(week?: string, signal?: AbortSignal): Promise<MyVotes> {
  return apiFetch(`/api/me/votes${week ? `?week=${encodeURIComponent(week)}` : ''}`, {
    schema: MyVotesSchema,
    signal,
  })
}

export function ticker(slug: string, since?: number, signal?: AbortSignal): Promise<Ticker> {
  return apiFetch(`/api/weeks/${encodeURIComponent(slug)}/ticker${since ? `?since=${since}` : ''}`, {
    schema: TickerSchema,
    signal,
  })
}

/** `PUT /api/entries/:id/vote` (`RF-VOTE-01..06`). */
export function putVote(entryId: string, stars: number): Promise<Vote> {
  return apiFetch(`/api/entries/${encodeURIComponent(entryId)}/vote`, {
    method: 'PUT',
    body: { stars },
    schema: VoteSchema,
  })
}

/** `DELETE /api/entries/:id/vote` (`RF-VOTE-13`): 204 sin cuerpo. */
export function deleteVote(entryId: string): Promise<void> {
  return apiFetch(`/api/entries/${encodeURIComponent(entryId)}/vote`, {
    method: 'DELETE',
    schema: z.undefined(),
  })
}

/** `GET /api/entries/:id/stats`: votos y escuchas de la propia, sin media. */
export function entryStats(entryId: string, signal?: AbortSignal): Promise<EntryStats> {
  return apiFetch(`/api/entries/${encodeURIComponent(entryId)}/stats`, { schema: EntryStatsSchema, signal })
}

/** `POST /api/entries/:id/report` (`RF-VOTE-12`). */
export function reportEntry(entryId: string, request: ReportRequest): Promise<unknown> {
  return apiFetch(`/api/entries/${encodeURIComponent(entryId)}/report`, {
    method: 'POST',
    body: request,
    schema: z.object({ ok: z.literal(true) }),
  })
}
