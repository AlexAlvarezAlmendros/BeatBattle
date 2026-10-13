import { WeekResultsSchema } from '@beatbattle/shared'
import { apiFetch } from './api'
import { queryKeys } from './queryKeys'

/** Resultados de una semana sellada (`GET /api/weeks/:slug/results`, §4.10): 404 si no lo está. */
export function resultsQuery(slug: string) {
  return {
    queryKey: queryKeys.results(slug),
    queryFn: ({ signal }: { signal?: AbortSignal }) =>
      apiFetch(`/api/weeks/${encodeURIComponent(slug)}/results`, { schema: WeekResultsSchema, signal }),
  }
}
