import { texture, textureMobile } from '@beatbattle/shared/tokens'
import { HalftoneCanvas } from '../../ui/arena/HalftoneCanvas'
import { useMediaQuery } from '../../ui/hooks/useMediaQuery'
import styles from './ArenaBackdrop.module.css'
import type { ArenaWedge } from './screen'
import { FrameSlotTarget } from './slots'

/** Corte de móvil de las maquetas (§3.2 «Espaciado»): por debajo, la diagonal pasa a horizontal inclinada. */
export const MOBILE_QUERY = '(max-width: 720px)'

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
 *   (`data-fx`): el modo serio los quita y deja la trama fija.
 * - El hueco `arena` es para lo que la pantalla pone dentro de la cuña (el número de semana gigante).
 * - Sin rayos (`rays={false}`) en las pantallas de texto sin pieza que los tape (la galería).
 *
 * Sin líneas de barrido ni grano: son postproceso de calidad alta (§3.5 capa 3). Nunca va texto encima
 * sin panel (`RD-VIS-05`): las formas de la trama dejan sin puntos las zonas de texto.
 */
export function ArenaBackdrop({ wedge, rays = true }: { wedge: ArenaWedge; rays?: boolean }) {
  const mobile = useMediaQuery(MOBILE_QUERY)
  const cell = mobile ? textureMobile.halftoneCell : texture.halftoneCell
  const shape = mobile ? 'menuWedgeMobile' : wedge === 'right' ? 'menuWedge' : 'interiorWedge'
  return (
    <div className={styles.arena} data-wedge={wedge} aria-hidden="true">
      {rays && <div className={styles.burst} data-fx="" />}
      {wedge !== 'none' && (
        <>
          <div className={styles.wedge}>
            <div className={styles.straight}>
              <HalftoneCanvas className={styles.halftone} shape={shape} cell={cell} background="wine2" />
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
