import {
  type AdminCalendar,
  AdminCalendarSchema,
  type AdminSample,
  AdminSampleSchema,
  type AdminWeek,
  AdminWeekSchema,
  type SampleCreate,
  type SampleUpdate,
  type SampleUploadPart,
  SignedUploadSchema,
  type WeekCreate,
  type WeekUpdate,
} from '@beatbattle/shared'
import { queryOptions } from '@tanstack/react-query'
import { z } from 'zod'
import { type ApiClientError, apiFetch } from './api'
import { queryKeys } from './queryKeys'

/** Panel de admin (§2.14, tarea 3.18): samples y calendario. El servidor exige el rol (`RF-AUTH-03`). */

export function adminSamplesQuery() {
  return queryOptions<AdminSample[], ApiClientError>({
    queryKey: queryKeys.admin.samples(),
    queryFn: ({ signal }) => apiFetch('/api/admin/samples', { schema: z.array(AdminSampleSchema), signal }),
    retry: false,
  })
}

export function adminSampleQuery(id: string) {
  return queryOptions<AdminSample, ApiClientError>({
    queryKey: [...queryKeys.admin.samples(), id],
    queryFn: ({ signal }) =>
      apiFetch(`/api/admin/samples/${encodeURIComponent(id)}`, { schema: AdminSampleSchema, signal }),
    retry: false,
  })
}

export function adminCalendarQuery() {
  return queryOptions<AdminCalendar, ApiClientError>({
    queryKey: queryKeys.admin.calendar(),
    queryFn: ({ signal }) => apiFetch('/api/admin/weeks', { schema: AdminCalendarSchema, signal }),
    retry: false,
  })
}

const SignedSampleUpload = z.object({ sampleId: z.string(), upload: SignedUploadSchema })

export function signSampleUpload(part: SampleUploadPart, sampleId?: string) {
  return apiFetch('/api/admin/samples/sign', {
    method: 'POST',
    body: sampleId ? { part, sampleId } : { part },
    schema: SignedSampleUpload,
  })
}

export const createSample = (input: SampleCreate) =>
  apiFetch('/api/admin/samples', { method: 'POST', body: input, schema: AdminSampleSchema })

export const updateSample = (id: string, patch: SampleUpdate) =>
  apiFetch(`/api/admin/samples/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: patch,
    schema: AdminSampleSchema,
  })

export const deleteSample = (id: string) =>
  apiFetch(`/api/admin/samples/${encodeURIComponent(id)}`, { method: 'DELETE', schema: z.unknown() })

export const scheduleWeek = (input: WeekCreate): Promise<AdminWeek> =>
  apiFetch('/api/admin/weeks', { method: 'POST', body: input, schema: AdminWeekSchema })

export const updateWeek = (slug: string, patch: WeekUpdate): Promise<AdminWeek> =>
  apiFetch(`/api/admin/weeks/${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    body: patch,
    schema: AdminWeekSchema,
  })

export const unscheduleWeek = (slug: string) =>
  apiFetch(`/api/admin/weeks/${encodeURIComponent(slug)}`, { method: 'DELETE', schema: z.unknown() })

/** Una subida rechazada por el almacenamiento, con su código y, si lo da, su motivo (Cloudinary: `error.message`). */
export class UploadError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string | null,
  ) {
    super(`subida: ${status}${reason ? ` (${reason})` : ''}`)
  }
}

/** El motivo de un rechazo de Cloudinary (`{ "error": { "message": … } }`), sin el punto final y recortado; si no lo hay, null. */
export function uploadReason(body: string): string | null {
  try {
    const message = (JSON.parse(body) as { error?: { message?: unknown } }).error?.message
    return typeof message === 'string' && message.trim()
      ? message.trim().replace(/\.+$/, '').slice(0, 160)
      : null
  } catch {
    return null
  }
}

/**
 * Sube un fichero directamente al almacenamiento con la firma del servidor (§4.8.2): el audio nunca pasa
 * por la API. `XMLHttpRequest` y no `fetch` porque da el progreso de la subida. Si el almacenamiento la
 * rechaza, el error lleva su motivo para que el panel lo enseñe.
 */
export function uploadSigned(
  upload: { uploadUrl: string; fields: Record<string, string> },
  file: File,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    for (const [key, value] of Object.entries(upload.fields)) form.append(key, value)
    form.append('file', file)
    const xhr = new XMLHttpRequest()
    xhr.open('POST', upload.uploadUrl)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total)
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new UploadError(xhr.status, uploadReason(xhr.responseText)))
    xhr.onerror = () => reject(new Error('subida: sin conexión'))
    xhr.onabort = () => reject(new DOMException('cancelada', 'AbortError'))
    signal?.addEventListener('abort', () => xhr.abort())
    xhr.send(form)
  })
}
