import { referenceCoverDots } from '@beatbattle/covers'
import { cx } from '../forceState'
import styles from './CoverArt.module.css'

/** Radio del disco del emblema en el `viewBox` de 100 (el 46 % del lado, como en las maquetas). */
export const COVER_RADIUS = 46

/** Centro de la portada en el `viewBox`. */
const CENTER = 50

/** Rayos del fondo (§3.4.5: «degradado granate a negro y rayos al 3 %»): 24, como en `drawCover`. */
const RAYS = 24

/** Coordenada en el `viewBox`, con dos decimales (el SVG no necesita más). */
const at = (value: number) => Math.round(value * 100) / 100

/**
 * La portada de referencia de las maquetas, calculada una sola vez con `@beatbattle/covers`: los puntos
 * ya traen su presupuesto de tinta (11,5 % del disco en rojo y 1,6 % en blanco) y los rayos se giran con
 * su `rot`, como en `drawCover` de `final.js`.
 */
const COVER = (() => {
  const { spec, red, white } = referenceCoverDots()
  const toCircle = (dot: { x: number; y: number; r: number }) => ({
    cx: at(CENTER + dot.x * COVER_RADIUS),
    cy: at(CENTER + dot.y * COVER_RADIUS),
    r: at(dot.r * COVER_RADIUS),
  })
  const rays = Array.from({ length: RAYS }, (_, index) => {
    const angle = spec.rot + ((index + 1) * Math.PI * 2) / RAYS
    // Un triángulo del centro hasta fuera de la portada, de ±5 % de ancho (el de las maquetas).
    const point = (along: number, across: number) =>
      `${at(CENTER + Math.cos(angle) * along - Math.sin(angle) * across)},${at(CENTER + Math.sin(angle) * along + Math.cos(angle) * across)}`
    return `${CENTER},${CENTER} ${point(100, -5)} ${point(100, 5)}`
  })
  return {
    rays,
    red: red.map(toCircle).filter((circle) => circle.r > 0),
    white: white.map(toCircle).filter((circle) => circle.r > 0),
  }
})()

export interface CoverArtProps {
  className?: string
}

/**
 * Portada de una entrada durante el voto ciego (guía §3.4.5): el emblema de puntos de la **portada de
 * referencia** de las maquetas (espiral, 7 pliegues, 92 BPM) sobre el fondo granate con rayos al 3 %, y
 * la galleta central. Es **la misma para todas las entradas** hasta que `packages/covers` pinte la de
 * cada una (Fase 4, `RD-VIS-04`), así que ninguna se distingue por su portada (§1.3). Decorativa
 * (`aria-hidden`): la entrada se nombra por su alias. Sin retratos ni nada que identifique a nadie.
 */
export function CoverArt({ className }: CoverArtProps) {
  return (
    <svg viewBox="0 0 100 100" className={cx(styles.cover, className)} aria-hidden="true" focusable="false">
      {COVER.rays.map((points) => (
        <polygon key={points} points={points} className={styles.ray} />
      ))}
      {COVER.red.map((dot) => (
        <circle key={`r${dot.cx}-${dot.cy}`} {...dot} className={styles.red} data-ink="red" />
      ))}
      {COVER.white.map((dot) => (
        <circle key={`w${dot.cx}-${dot.cy}`} {...dot} className={styles.white} data-ink="white" />
      ))}
      <circle cx="50" cy="50" r="8.5" className={styles.hole} />
      <circle cx="50" cy="50" r="7" className={styles.label} />
      <circle cx="50" cy="50" r="1.4" className={styles.spindle} />
      <circle cx="50" cy="50" r="48.5" className={styles.rim} />
    </svg>
  )
}
