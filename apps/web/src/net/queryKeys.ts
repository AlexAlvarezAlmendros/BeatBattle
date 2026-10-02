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
} as const
