import { type Health, healthSchema } from '@beatbattle/shared'
import { queryOptions, useQuery } from '@tanstack/react-query'
import { type ApiClientError, apiFetch, isRetryable } from './api'
import { queryKeys } from './queryKeys'

/**
 * Patrón de cada recurso: `xxxQuery()` con las opciones (sirve para `useQuery`, `prefetchQuery` y
 * los cargadores del router) y un hook `useXxx()` encima.
 */
export function healthQuery() {
  return queryOptions<Health, ApiClientError>({
    queryKey: queryKeys.health(),
    queryFn: ({ signal }) => apiFetch('/api/health', { schema: healthSchema, signal }),
    retry: (failures, error) => failures < 2 && isRetryable(error),
  })
}

/** Estado de la API (ejemplo de hook de datos del servidor). */
export function useHealth() {
  return useQuery(healthQuery())
}
