import { ArchiveSchema } from '@beatbattle/shared'
import { apiFetch } from './api'
import { queryKeys } from './queryKeys'

/** El archivo de semanas selladas, página a página (`GET /api/weeks?cursor=`, `RF-ARC-01`). */
export function archiveQuery() {
  return {
    queryKey: queryKeys.archive(),
    queryFn: ({ pageParam, signal }: { pageParam: string | null; signal?: AbortSignal }) =>
      apiFetch(`/api/weeks${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`, {
        schema: ArchiveSchema,
        signal,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (page: { next: string | null }) => page.next,
  }
}
