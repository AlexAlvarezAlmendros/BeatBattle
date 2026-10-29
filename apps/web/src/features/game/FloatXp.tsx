import { duration, ease, reducedDuration, spring } from '@beatbattle/shared/tokens'
import { useAnimate } from 'motion/react'
import { type CSSProperties, useLayoutEffect, useMemo } from 'react'
import { HUD_XP_ATTRIBUTE } from '../../app/layout/PlayerCard'
import { audio } from '../../audio/engine'
import { formatNumber, t } from '../../i18n'
import { useReducedMotion } from '../../ui/hooks/useReducedMotion'
import styles from './FloatXp.module.css'
import { type Anchor, type FloatXp as FloatXpData, useHud } from './hudStore'

/** Lo que sube con el muelle antes de volar al medidor (§3.4.2). */
export const FLOAT_RISE_PX = 24
/** Separación entre lo que lo provoca y el «+XP», en px (`--bb-space-3`). */
const GAP_PX = 12
/** Ancho que se le supone al «+5 XP» para decidir si cabe a la derecha (se mide en `FloatXp.module.css`). */
const FLOAT_WIDTH_PX = 96
/** Se deja este margen con el borde de la ventana. */
const EDGE_PX = 16

/** Dónde nace y hacia dónde se coloca respecto a ese punto. */
export interface FloatPlacement {
  x: number
  y: number
  /** `right`: a la derecha de lo que lo provoca, centrado en vertical; `above`: encima, alineado a su borde derecho. */
  side: 'right' | 'above' | 'meter'
}

/**
 * Dónde nace el «+XP» (§3.4.2): a la derecha de su caja si cabe en la ventana y, si no, encima de ella, alineado a su
 * borde derecho: nunca encima de lo que lo provoca (una tecla, una estrella). Sin caja, junto al medidor del HUD.
 */
export function placeFloat(
  anchor: Anchor | null,
  meter: Anchor | null,
  viewportWidth: number,
): FloatPlacement {
  if (!anchor) {
    const box = meter ?? { x: EDGE_PX, y: EDGE_PX, width: 0, height: 0 }
    return { x: box.x + box.width / 2, y: box.y + box.height + GAP_PX + FLOAT_RISE_PX, side: 'meter' }
  }
  const right = anchor.x + anchor.width + GAP_PX
  if (right + FLOAT_WIDTH_PX <= viewportWidth - EDGE_PX)
    return { x: right, y: anchor.y + anchor.height / 2, side: 'right' }
  return {
    x: Math.max(EDGE_PX + FLOAT_WIDTH_PX, anchor.x + anchor.width),
    y: anchor.y - GAP_PX,
    side: 'above',
  }
}

/** El medidor de XP del HUD, si se ve en la ventana (el Modo Jurado no lo lleva; la página puede estar bajada). */
export function visibleMeter(): Anchor | null {
  const element = document.querySelector(`[${HUD_XP_ATTRIBUTE}]`)
  if (!element?.isConnected) return null
  const box = element.getBoundingClientRect()
  if (box.width < 1 || box.height < 1 || box.bottom <= 0 || box.top >= window.innerHeight) return null
  if (typeof element.checkVisibility === 'function' && !element.checkVisibility({ visibilityProperty: true }))
    return null
  return { x: box.x, y: box.y, width: box.width, height: box.height }
}

const seconds = (ms: number) => ms / 1000

/**
 * Un «+XP» flotante (§3.4.2, Anexo E): nace junto a lo que lo provoca, sube 24 px con el muelle de recompensa y, a mitad
 * de los 900 ms, vuela al medidor del HUD, que lo traga (`land`: el medidor sube con su brillo y suena `xp.gain`). Sin
 * medidor a la vista, sube y se funde donde nació. Sin movimiento, aparece y se funde en su sitio.
 */
export function FloatXp({ float }: { float: FloatXpData }) {
  const reduced = useReducedMotion()
  const [scope, animate] = useAnimate<HTMLSpanElement>()
  // Dónde nace y adónde va, una vez (al montarse): lo de después de moverse la página no lo cambia.
  const { placement, meter } = useMemo(() => {
    const meter = visibleMeter()
    return { placement: placeFloat(float.anchor, meter, window.innerWidth), meter }
  }, [float.anchor])

  useLayoutEffect(() => {
    const element = scope.current
    if (!element) return
    let cancelled = false
    const land = () => {
      if (cancelled) return
      audio.play('xp.gain', float.combo ? { xpCombo: float.combo } : {})
      useHud.getState().land(float.id)
    }
    const run = async () => {
      if (reduced) {
        const fade = seconds(reducedDuration.reward)
        await animate(element, { opacity: [0, 1] }, { duration: fade, ease: [...ease.out] })
        await animate(
          element,
          { opacity: 0 },
          {
            duration: fade,
            delay: seconds(duration.reward - 2 * reducedDuration.reward),
            ease: [...ease.out],
          },
        )
        return land()
      }
      const half = duration.reward / 2
      const box = element.getBoundingClientRect()
      // Primero sube con el muelle; a mitad de camino, vuela (una animación nueva del mismo valor para la anterior,
      // así que la del vuelo empieza cuando toca y no antes).
      void animate(element, { opacity: [0, 1] }, { duration: seconds(duration.fast), ease: [...ease.out] })
      void animate(element, { y: [0, -FLOAT_RISE_PX] }, { type: 'spring', ...spring.reward })
      await new Promise((resolve) => window.setTimeout(resolve, half))
      if (cancelled) return
      if (meter) {
        const dx = meter.x + meter.width / 2 - (box.x + box.width / 2)
        const dy = meter.y + meter.height / 2 - (box.y + box.height / 2)
        await animate(
          element,
          { x: dx, y: dy, scale: 0.6, opacity: 0 },
          { duration: seconds(half), ease: [...ease.inOut] },
        )
      } else {
        await animate(
          element,
          { y: -FLOAT_RISE_PX * 1.5, opacity: 0 },
          { duration: seconds(half), ease: [...ease.out] },
        )
      }
      land()
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [animate, float.combo, float.id, meter, reduced, scope])

  return (
    <span
      ref={scope}
      className={styles.float}
      data-side={placement.side}
      data-float-xp=""
      style={{ left: placement.x, top: placement.y } as CSSProperties}
      aria-hidden="true"
    >
      {t('game.float', { amount: formatNumber(float.amount) })}
    </span>
  )
}

/** Los «+XP» en vuelo (la región viva ya los dice; estos son solo para la vista). */
export function FloatXpLayer() {
  const floats = useHud((state) => state.floats)
  return floats.map((float) => <FloatXp key={float.id} float={float} />)
}
