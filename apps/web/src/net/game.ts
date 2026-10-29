import { HallOfFameSchema, PublicProfileSchema, SeasonStandingsSchema } from '@beatbattle/shared'
import { apiFetch } from './api'
import { queryKeys } from './queryKeys'

/**
 * Lo público de la capa de juego (guía §2.3, §2.9, §4.10; tareas 7.24–7.26): el perfil de un productor, el salón de la
 * fama y la clasificación de una temporada. Todo cuenta solo semanas selladas (hueco G1): lo filtra el servidor.
 */

/** `GET /api/profiles/:username` (sigue el 301 de un nombre anterior; 404 si no existe). */
export function profileQuery(username: string) {
  return {
    queryKey: queryKeys.profile(username.toLowerCase()),
    queryFn: ({ signal }: { signal?: AbortSignal }) =>
      apiFetch(`/api/profiles/${encodeURIComponent(username)}`, { schema: PublicProfileSchema, signal }),
  }
}

/** `GET /api/hall-of-fame` (`RF-ARC-02`). */
export function hallOfFameQuery() {
  return {
    queryKey: queryKeys.hallOfFame(),
    queryFn: ({ signal }: { signal?: AbortSignal }) =>
      apiFetch('/api/hall-of-fame', { schema: HallOfFameSchema, signal }),
  }
}

/** `GET /api/seasons/:id/standings` (`RF-ARC-03`): 404 si la temporada no existe o aún no ha empezado. */
export function seasonQuery(id: string) {
  return {
    queryKey: queryKeys.season(id),
    queryFn: ({ signal }: { signal?: AbortSignal }) =>
      apiFetch(`/api/seasons/${encodeURIComponent(id)}/standings`, { schema: SeasonStandingsSchema, signal }),
  }
}
