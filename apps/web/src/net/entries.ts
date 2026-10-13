import {
  type EntryCoverSignRequest,
  type EntryCreate,
  type EntrySignedUpload,
  EntrySignedUploadSchema,
  type EntrySignRequest,
  type EntryUpdate,
  type OwnEntry,
  OwnEntrySchema,
} from '@beatbattle/shared'
import { z } from 'zod'
import { apiFetch } from './api'

/**
 * Entradas (§4.10; Fase 4): firmar la subida del audio y de la portada propia, registrar la entrada, editar
 * su ficha, sustituir el audio y retirarla. El audio va directo al almacenamiento con la firma; aquí solo
 * viajan la firma y la ficha.
 */

/** `POST /api/uploads/sign` del audio o de la portada propia: la firma y el *intent* de 1 h. */
export function signEntryUpload(
  request: EntrySignRequest | EntryCoverSignRequest,
  signal?: AbortSignal,
): Promise<EntrySignedUpload> {
  return apiFetch('/api/uploads/sign', {
    method: 'POST',
    body: request,
    schema: EntrySignedUploadSchema,
    signal,
  })
}

/** `POST /api/weeks/:slug/entries`: la entrada ya subida, verificada y medida en el servidor. */
export function createEntry(slug: string, body: EntryCreate, signal?: AbortSignal): Promise<OwnEntry> {
  return apiFetch(`/api/weeks/${encodeURIComponent(slug)}/entries`, {
    method: 'POST',
    body,
    schema: OwnEntrySchema,
    signal,
  })
}

/** `PATCH /api/entries/:id`: la ficha, hasta el cierre de envíos. */
export function updateEntry(id: string, body: EntryUpdate): Promise<OwnEntry> {
  return apiFetch(`/api/entries/${encodeURIComponent(id)}`, { method: 'PATCH', body, schema: OwnEntrySchema })
}

/** `PUT /api/entries/:id/audio`: el audio nuevo, ya subido con una firma de sustitución. */
export function replaceEntryAudio(id: string, intentId: string, signal?: AbortSignal): Promise<OwnEntry> {
  return apiFetch(`/api/entries/${encodeURIComponent(id)}/audio`, {
    method: 'PUT',
    body: { intentId },
    schema: OwnEntrySchema,
    signal,
  })
}

/** `DELETE /api/entries/:id`: retirar la entrada (se borran el audio y sus votos). */
export function withdrawEntry(id: string): Promise<unknown> {
  return apiFetch(`/api/entries/${encodeURIComponent(id)}`, { method: 'DELETE', schema: z.unknown() })
}
