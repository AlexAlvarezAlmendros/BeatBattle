import { duration, ease, reducedDuration } from '@beatbattle/shared/tokens'
import type { Variants } from 'motion/react'
import { useReducedMotion } from '../../../ui/hooks/useReducedMotion'

/**
 * Entrada del hero con Motion (guía §3.6; en el sello, `fadeInUp` escalonado de Hero.css): cada pieza
 * sube 30 px y aparece, una tras otra. Con «reducir movimiento» (RNF-A11Y-03, Anexo E), todas a la vez
 * con un fundido de 200 ms y sin desplazamiento.
 *
 * `HeroSection` es el contenedor (`initial="hidden"`, `animate="shown"`); las piezas solo declaran sus
 * variantes y Motion las hereda por contexto. Fuera de un `HeroSection` se pintan quietas.
 */

const RISE_PX = 30

export interface HeroRevealVariants {
  container: Variants
  /** Sube y aparece (titular, subtítulo, botones…). */
  item: Variants
  /** Solo aparece (rótulos laterales, que ya llevan su propia transformación en CSS). */
  fade: Variants
  /** Crece desde el centro (el filete rojo). */
  grow: Variants
}

const seconds = (ms: number) => ms / 1000

export function heroRevealVariants(reduced: boolean): HeroRevealVariants {
  if (reduced) {
    const fadeIn = { duration: seconds(reducedDuration.slow), ease: ease.out }
    // Las variantes conservan `y` y `scaleX` en reposo: si «reducir movimiento» se activa en caliente
    // (ajuste de la app), Motion no devuelve la pieza a su posición inicial al desaparecer esas claves.
    const at = (rest: Record<string, number>): Variants => ({
      hidden: { opacity: 0, ...rest },
      shown: { opacity: 1, ...rest, transition: fadeIn },
    })
    return { container: { hidden: {}, shown: {} }, item: at({ y: 0 }), fade: at({}), grow: at({ scaleX: 1 }) }
  }
  const enter = { duration: seconds(duration.slow), ease: ease.out }
  return {
    container: {
      hidden: {},
      shown: {
        transition: { delayChildren: seconds(duration.base), staggerChildren: seconds(duration.fast) },
      },
    },
    item: { hidden: { opacity: 0, y: RISE_PX }, shown: { opacity: 1, y: 0, transition: enter } },
    fade: { hidden: { opacity: 0 }, shown: { opacity: 1, transition: enter } },
    grow: { hidden: { opacity: 0, scaleX: 0 }, shown: { opacity: 1, scaleX: 1, transition: enter } },
  }
}

/** Variantes de la entrada según «reducir movimiento» (sistema o ajuste de la app). */
export function useHeroReveal(): HeroRevealVariants {
  return heroRevealVariants(useReducedMotion())
}
