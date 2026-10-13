import {
  type CurrentWeek,
  CurrentWeekSchema,
  type Download,
  DownloadSchema,
  type PublicWeek,
  PublicWeekSchema,
  RULES_VERSION,
} from '@beatbattle/shared'
import { queryOptions, useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { type ApiClientError, apiFetch, isRetryable } from './api'
import { queryKeys } from './queryKeys'

const retry = (failures: number, error: ApiClientError) => failures < 2 && isRetryable(error)

/** `GET /api/weeks/current`: la semana en juego o cuándo es el próximo drop (§2.1). */
export function currentWeekQuery() {
  return queryOptions<CurrentWeek, ApiClientError>({
    queryKey: queryKeys.weeks.current(),
    queryFn: ({ signal }) => apiFetch('/api/weeks/current', { schema: CurrentWeekSchema, signal }),
    retry,
  })
}

export function useCurrentWeek() {
  return useQuery(currentWeekQuery())
}

/** `GET /api/weeks/:slug`: la ficha del drop (404 antes de que empiece). */
export function weekQuery(slug: string) {
  return queryOptions<PublicWeek, ApiClientError>({
    queryKey: queryKeys.weeks.detail(slug),
    queryFn: ({ signal }) =>
      apiFetch(`/api/weeks/${encodeURIComponent(slug)}`, { schema: PublicWeekSchema, signal }),
    retry,
  })
}

export function useWeek(slug: string) {
  return useQuery(weekQuery(slug))
}

const Nothing = z.unknown()

/** Aceptar las bases de la semana (`RF-DROP-06`). */
export function acceptRules(slug: string): Promise<unknown> {
  return apiFetch(`/api/weeks/${encodeURIComponent(slug)}/rules`, {
    method: 'POST',
    body: { rulesVersion: RULES_VERSION },
    schema: Nothing,
  })
}

/** URL firmada de descarga del sample (`RF-DROP-07`): caduca en 1 h. */
export function requestDownload(slug: string, kind: 'original' | 'stems'): Promise<Download> {
  return apiFetch(`/api/weeks/${encodeURIComponent(slug)}/sample/download`, {
    method: 'POST',
    body: { kind },
    schema: DownloadSchema,
  })
}

/** Marcar la revelación del drop como vista (`RF-DROP-11`). */
export function markDropSeen(slug: string): Promise<unknown> {
  return apiFetch('/api/me/seen', { method: 'POST', body: { kind: 'drop', ref: slug }, schema: Nothing })
}

/** Alerta de drop sin cuenta (§2.12.3): siempre «revisa tu email», sin decir si la dirección ya estaba. */
export function subscribeToDrops(email: string): Promise<unknown> {
  return apiFetch('/api/subscribe', { method: 'POST', body: { email }, schema: Nothing })
}

export function confirmDropAlert(token: string): Promise<unknown> {
  return apiFetch('/api/subscribe/confirm', { method: 'POST', body: { token }, schema: Nothing })
}
