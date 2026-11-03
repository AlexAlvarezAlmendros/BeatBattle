import { lazy, Suspense } from 'react'
import { useLocation } from 'react-router'
import { useRewardsHold } from './hudStore'
import {
  finishSeasonCeremony,
  isSeasonCeremonyScreen,
  usePendingSeasonCeremony,
  useSeasonCeremony,
} from './seasonCeremony'

// La capa (la carta, el confeti, su línea de tiempo), en diferido: sale una vez por temporada (§4.17).
const SeasonCeremony = lazy(() => import('./SeasonCeremony').then((m) => ({ default: m.SeasonCeremony })))

/**
 * La ceremonia del campeón de temporada en el marco (guía §3.8.15, `RF-ARC-05`; tarea 7.27), una sola vez en
 * `RootLayout`. Con una pendiente (`me.game.seasonCeremony`) y en una de sus pantallas (el menú principal o los
 * resultados de una semana de esa temporada), retiene los avisos de logro y de nivel (§3.8.8): así el «¡LOGRO
 * LEGENDARIO!» de `season_champ` sale después de ella, también al pasar de la oferta del menú a los resultados. Cuando
 * la pantalla le da su turno (`SeasonCeremonyCue`), pide la capa y la enseña; al cerrarse, la marca vista y suelta los
 * avisos.
 */
export function SeasonCeremonyHost() {
  const { pathname } = useLocation()
  const pending = usePendingSeasonCeremony()
  const turn = useSeasonCeremony((state) => state.cues > 0)
  const here = pending !== null && isSeasonCeremonyScreen(pathname, pending.seasonId)
  useRewardsHold(here)
  if (!pending || !here || !turn) return null
  return (
    <Suspense fallback={null}>
      <SeasonCeremony
        key={pending.seasonId}
        seasonId={pending.seasonId}
        champion={pending.champion}
        onDone={(seen) => finishSeasonCeremony(pending.seasonId, seen)}
      />
    </Suspense>
  )
}
