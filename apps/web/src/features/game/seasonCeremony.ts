import { mondayOfSlug, seasonOf } from '@beatbattle/rules'
import type { SeasonCeremony } from '@beatbattle/shared'
import { useEffect } from 'react'
import { z } from 'zod'
import { create } from 'zustand'
import { apiFetch } from '../../net/api'
import { useSession } from '../account/session'

/**
 * La ceremonia del campeón de temporada (guía §3.8.15, §2.9, `RF-ARC-05`; tarea 7.27), lo que vive en el marco (sin
 * Motion ni la carta: la capa llega en diferido, `SeasonCeremony.tsx`).
 *
 * - **Pendiente**: la de `me.game.seasonCeremony`, mientras esta pestaña no la haya enseñado (o saltado).
 * - **Sus pantallas**: el menú principal y los resultados de una semana de esa temporada. Mientras está pendiente en
 *   una de ellas, los avisos de logro y de nivel esperan (§3.8.8), también al pasar de una a otra.
 * - **Su turno**: la pantalla lo da cuando ya no tiene delante otra capa (`SeasonCeremonyCue`): el menú, tras la
 *   pantalla de título, la revelación del drop y la oferta de la ceremonia de la semana; los resultados, al abrirse o al
 *   cerrarse la ceremonia de la semana.
 */

interface SeasonCeremonyState {
  /** Pantallas que ahora mismo le dan su turno (cuántas: al cambiar de pantalla, una entra antes de que salga otra). */
  cues: number
  /** Temporadas ya enseñadas o saltadas en esta pestaña (o que no se han podido cargar: no se reintenta hasta recargar). */
  done: readonly string[]
}

export const useSeasonCeremony = create<SeasonCeremonyState>(() => ({ cues: 0, done: [] }))

/** La ceremonia pendiente de la sesión que aún no ha salido en esta pestaña; `null` si no hay. */
export function usePendingSeasonCeremony(): SeasonCeremony | null {
  const pending = useSession((state) => state.me?.game.seasonCeremony ?? null)
  const done = useSeasonCeremony((state) => state.done)
  return pending && !done.includes(pending.seasonId) ? pending : null
}

/** La temporada de la página de resultados de `pathname` (`/semana/2026-w52/resultados` → «2026-T4»); si no, `null`. */
export function resultsSeasonOf(pathname: string): string | null {
  const match = /^\/semana\/([^/]+)\/resultados\/?$/.exec(pathname)
  if (!match?.[1]) return null
  try {
    return seasonOf(mondayOfSlug(decodeURIComponent(match[1])))
  } catch {
    return null
  }
}

/** ¿Es `pathname` una de sus pantallas para la temporada `seasonId`? El menú principal o los resultados de esa temporada. */
export function isSeasonCeremonyScreen(pathname: string, seasonId: string): boolean {
  return pathname === '/' || resultsSeasonOf(pathname) === seasonId
}

/**
 * Lo pone una pantalla cuando ya no tiene delante otra capa: le da su turno mientras esté montado. No pinta nada (la capa
 * la pinta `SeasonCeremonyHost`, en el marco).
 */
export function SeasonCeremonyCue(): null {
  useEffect(() => {
    useSeasonCeremony.setState((state) => ({ cues: state.cues + 1 }))
    return () => useSeasonCeremony.setState((state) => ({ cues: Math.max(0, state.cues - 1) }))
  }, [])
  return null
}

const Nothing = z.unknown()

/**
 * Al cerrarse (o saltarse): no vuelve a salir en esta pestaña y, si `seen`, queda vista en el servidor (`POST /api/me/seen`
 * con `season_champion`, `RF-ARC-05`: recargar u otro dispositivo no la repiten) y en la sesión. Sin `seen` (no se ha
 * podido cargar), sigue pendiente para la próxima visita.
 */
export function finishSeasonCeremony(seasonId: string, seen: boolean): void {
  useSeasonCeremony.setState((state) =>
    state.done.includes(seasonId) ? state : { done: [...state.done, seasonId] },
  )
  if (!seen) return
  useSession.setState((state) =>
    state.me?.game.seasonCeremony?.seasonId === seasonId
      ? { me: { ...state.me, game: { ...state.me.game, seasonCeremony: null } } }
      : state,
  )
  apiFetch('/api/me/seen', {
    method: 'POST',
    body: { kind: 'season_champion', ref: seasonId },
    schema: Nothing,
  }).catch((error) => console.warn('No se pudo marcar vista la ceremonia de temporada', error))
}
