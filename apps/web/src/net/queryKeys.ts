/**
 * Registro de claves de TanStack Query (guía §4.7.2): una entrada por recurso, de lo general a lo
 * concreto (`['entries', slug, order]`), para poder invalidar por prefijo
 * (`queryClient.invalidateQueries({ queryKey: queryKeys.entries.all })`). Nunca se escriben claves
 * a mano fuera de este fichero.
 *
 * Cada fase añade aquí las suyas (`week`, `entries`, `me`…) junto con su hook en `net/`.
 */
export const queryKeys = {
  health: () => ['health'] as const,
  weeks: {
    all: ['weeks'] as const,
    current: () => ['weeks', 'current'] as const,
    detail: (slug: string) => ['weeks', 'detail', slug] as const,
  },
  entries: {
    all: ['entries'] as const,
    mine: (slug: string) => ['entries', 'mine', slug] as const,
    list: (slug: string, search: string) => ['entries', 'list', slug, search] as const,
    detail: (id: string) => ['entries', 'detail', id] as const,
    stats: (id: string) => ['entries', 'stats', id] as const,
  },
  jury: {
    all: ['jury'] as const,
    queue: (week?: string) => ['jury', 'queue', week ?? 'current'] as const,
  },
  ticker: (slug: string) => ['ticker', slug] as const,
  admin: {
    all: ['admin'] as const,
    samples: () => ['admin', 'samples'] as const,
    calendar: () => ['admin', 'weeks'] as const,
  },
} as const
