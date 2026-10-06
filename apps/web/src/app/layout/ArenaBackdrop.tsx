import { texture, textureMobile } from '@beatbattle/shared/tokens'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { arenaUsesStage, useStageQuality } from '../../stage/quality'
import { whenIdleAfterFirstPaint } from '../../ui/afterFirstPaint'
import { HalftoneCanvas } from '../../ui/arena/HalftoneCanvas'
import { useMediaQuery } from '../../ui/hooks/useMediaQuery'
import styles from './ArenaBackdrop.module.css'
import type { ArenaWedge } from './screen'
import { FrameSlotTarget } from './slots'
import { hasWebGL, useStageAllowed } from './stageGate'

/** El Escenario de WebGL (§3.5), en su propio trozo: nunca antes de la primera pintura (`RNF-PERF-04`). */
const Stage = lazy(() => import('../../stage/Stage'))

/** Corte de móvil de las maquetas (§3.2 «Espaciado»): por debajo, la diagonal pasa a horizontal inclinada. */
export const MOBILE_QUERY = '(max-width: 720px)'

/**
 * El menú va apilado, con la cuña abajo como en el móvil, también en una tableta vertical (§3.8.3): de 721
 * a 1199 px de ancho y como mucho 3:4 (`MainMenu`, `ArenaBackdrop.module.css`).
 */
export const STACKED_MENU_QUERY = `${MOBILE_QUERY}, (min-width: 721px) and (max-width: 1199px) and (max-aspect-ratio: 3/4)`

/**
 * La arena detrás de cada pantalla (guía §3.5, capa 0; tarea 0.23), en su versión estática (calidad
 * «Apagada»: el Escenario de WebGL llega con la Fase 1 y pinta esto mismo con *shader*). Fija a la
 * ventana y decorativa (`aria-hidden`):
 *
 * - **Cuña granate** (`--bb-wine-2`) con la **trama roja** generada por código, a la derecha en el menú
 *   y a la izquierda en las interiores, cortada por la **diagonal** a 17° (`--bb-split-angle`): banda
 *   roja de 12 px y filete blanco de 3 px a 14 px. La cuña y la diagonal se inclinan con `skewX` (el
 *   ángulo es el token en cualquier proporción de ventana); dentro, la trama se endereza con el giro
 *   contrario. En móvil, la diagonal pasa a horizontal inclinada (`clip-path`, como las maquetas).
 * - **Estallido de rayos** detrás del logo y **viñeta** en el borde. Los rayos son espectáculo
 *   (`data-fx`): el modo serio los quita y deja la trama fija. No llegan bajo el jugador del HUD (su
 *   caja la publica `Hud`): ningún texto del HUD va sobre ellos (`RD-VIS-05`).
 * - El hueco `arena` es para lo que la pantalla pone dentro de la cuña (el número de semana gigante).
 * - Sin rayos (`rays={false}`) en las pantallas de texto sin pieza que los tape (la galería).
 *
 * Sin líneas de barrido ni grano: son postproceso de calidad alta (§3.5 capa 3). Nunca va texto encima
 * sin panel (`RD-VIS-05`): las formas de la trama dejan sin puntos las zonas de texto.
 *
 * **El Escenario** (tarea 1.1, §3.5 «Reparto de la capa 0»): cuando la página ya se ha pintado y hay
 * WebGL (`stageGate`), carga su trozo y pinta la misma trama en *shader*, entre la cuña y lo demás. La
 * geometría la sigue poniendo este CSS: las sondas `data-stage-edge` marcan la diagonal y un punto de
 * dentro de la cuña, y el Escenario las lee. Hasta su primer fotograma se ve la trama estática; después,
 * `data-stage-live` la esconde. El número de semana va en una copia de la cuña por encima del lienzo.
 */
export function ArenaBackdrop({ wedge, rays = true }: { wedge: ArenaWedge; rays?: boolean }) {
  const mobile = useMediaQuery(MOBILE_QUERY)
  const stackedMenu = useMediaQuery(STACKED_MENU_QUERY) && wedge === 'right'
  const cell = mobile ? textureMobile.halftoneCell : texture.halftoneCell
  const shape = mobile || stackedMenu ? 'menuWedgeMobile' : wedge === 'right' ? 'menuWedge' : 'interiorWedge'

  const [arena, setArena] = useState<HTMLDivElement | null>(null)
  const allowed = useStageAllowed()
  const [load, setLoad] = useState(false)
  const [live, setLive] = useState(false)
  useEffect(() => {
    if (!allowed) {
      setLive(false)
      return
    }
    return whenIdleAfterFirstPaint(() => setLoad(hasWebGL()))
  }, [allowed])
  const onLive = useCallback(() => setLive(true), [])
  // Con calidad baja o apagada (la sonda o la elegida a mano), la arena estática (§3.5, 1.2).
  const quality = useStageQuality((state) => state.quality)
  const stage = allowed && load && arena !== null && arenaUsesStage(quality)

  return (
    <div
      ref={setArena}
      className={styles.arena}
      data-wedge={wedge}
      data-stage-live={stage && live ? '' : undefined}
      aria-hidden="true"
    >
      {rays && (
        <div className={styles.rays} data-fx="">
          <div className={styles.burst} />
        </div>
      )}
      {wedge !== 'none' && (
        <div className={styles.wedge}>
          <div className={styles.straight}>
            <HalftoneCanvas className={styles.halftone} shape={shape} cell={cell} background="wine2" />
          </div>
          <span className={styles.probe} data-stage-edge="a" />
          <span className={styles.probe} data-stage-edge="b" />
          <span className={styles.probe} data-stage-edge="in" />
        </div>
      )}
      {stage && (
        <Suspense fallback={null}>
          <Stage arena={arena} shape={wedge === 'none' ? null : shape} cell={cell} onLive={onLive} />
        </Suspense>
      )}
      {wedge !== 'none' && (
        <>
          <div className={styles.wedge} data-layer="extras">
            <div className={styles.straight}>
              <FrameSlotTarget name="arena" className={styles.extras} />
            </div>
          </div>
          <div className={styles.rule} />
          <div className={styles.band} />
        </>
      )}
      <div className={styles.vignette} />
    </div>
  )
}
