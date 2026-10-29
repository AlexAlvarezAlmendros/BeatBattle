import { t } from '../../i18n'
import { useHud } from './hudStore'

/**
 * Las recompensas del marco (guía §3.4.1, §3.4.2, §3.8.8; tareas 7.18–7.20), una sola vez en `RootLayout`.
 *
 * La **región viva** (`RNF-A11Y-07`) se pinta vacía desde el principio para que el lector anuncie lo que entra
 * («+5 XP», el logro, el nivel): una región que se monta llena no siempre se anuncia. Cada mensaje entra como un nodo
 * nuevo (su clave), así se anuncia también si repite el texto del anterior.
 */
export function RewardsViewport() {
  const live = useHud((state) => state.live)
  return (
    <div className="sr-only" role="status" aria-live="polite" aria-label={t('game.live.region')}>
      {live && <span key={live.key}>{live.text}</span>}
    </div>
  )
}
