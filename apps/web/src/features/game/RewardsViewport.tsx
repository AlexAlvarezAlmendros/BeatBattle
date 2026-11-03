import { type ComponentType, useEffect, useState } from 'react'
import { t } from '../../i18n'
import { whenIdleAfterFirstPaint } from '../../ui/afterFirstPaint'
import { useSession } from '../account/session'
import { useHud } from './hudStore'

let loadedLayer: ComponentType | undefined
let pendingLayer: Promise<ComponentType | null> | undefined

/**
 * Pide la parte animada de las recompensas (`RewardsLayer`: Motion, el «+XP», los avisos), una sola vez. Si no llega
 * (sin red, despliegue nuevo), nada se pinta: el medidor traga el XP igual pasado un rato y la región viva lo dice.
 */
export function loadRewardsLayer(): Promise<ComponentType | null> {
  pendingLayer ??= import('./RewardsLayer').then(
    (module) => {
      loadedLayer = module.RewardsLayer
      return module.RewardsLayer
    },
    () => null,
  )
  return pendingLayer
}

/** La parte animada, si ya está. Se pide tras la primera pintura con sesión, o en cuanto hay algo que pintar. */
function useRewardsLayer(signedIn: boolean, needed: boolean): ComponentType | null {
  const [layer, setLayer] = useState<ComponentType | null>(() => loadedLayer ?? null)
  useEffect(() => {
    if (layer || (!signedIn && !needed)) return
    let active = true
    const load = () => {
      void loadRewardsLayer().then((component) => {
        if (active && component) setLayer(() => component)
      })
    }
    if (needed) {
      load()
      return () => {
        active = false
      }
    }
    const cancel = whenIdleAfterFirstPaint(load)
    return () => {
      active = false
      cancel()
    }
  }, [layer, signedIn, needed])
  return layer
}

/**
 * Las recompensas del marco (guía §3.4.1, §3.4.2, §3.8.8; tareas 7.18–7.20), una sola vez en `RootLayout`.
 *
 * La **región viva** (`RNF-A11Y-07`) se pinta vacía desde el principio para que el lector anuncie lo que entra
 * («+5 XP», el logro, el nivel): una región que se monta llena no siempre se anuncia. Es un registro (`role="log"`,
 * educado, solo lo que se añade): cada mensaje entra como un nodo nuevo (su clave) y se lee una vez, aunque repita el
 * texto del anterior o salgan varios a la vez (dos placas y la subida de nivel; con un solo nodo que se cambiaba, el
 * lector solo oía el último). Lo que se ve (el «+XP» que vuela, los avisos) llega en diferido con `RewardsLayer`.
 */
export function RewardsViewport() {
  const live = useHud((state) => state.live)
  const needed = useHud((state) => state.floats.length > 0 || state.plates.length > 0 || state.big !== null)
  const signedIn = useSession((state) => state.me !== null)
  const Layer = useRewardsLayer(signedIn, needed)
  return (
    <>
      <div
        className="sr-only"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-atomic="false"
        aria-label={t('game.live.region')}
      >
        {live.map((message) => (
          <p key={message.key}>{message.text}</p>
        ))}
      </div>
      {Layer && <Layer />}
    </>
  )
}
