import { cx } from '../forceState'
import styles from './CoverArt.module.css'

/** Anillos del emblema (§3.4.5: un disco de 13 anillos). */
const RINGS = 13
const R0 = 0.15
const R1 = 0.92
const CELL = (R1 - R0) / (RINGS - 1)

interface Dot {
  x: number
  y: number
  r: number
  white: boolean
}

/**
 * Puntos del emblema de muestra, calculados una sola vez: anillos de puntos rojos cuyo tamaño ondula
 * con el ángulo (cinco pliegues) y, uno de cada tres, puntos blancos pequeños (el acento de §3.4.5).
 * Es **el mismo para todas las entradas**: hasta que `packages/covers` genere la portada de cada una
 * (Fase 4, `RD-VIS-04`), ninguna se distingue por su portada (la alternativa de §3.4.5: «portadas
 * idénticas con solo el alias»).
 */
const DOTS: readonly Dot[] = (() => {
  const dots: Dot[] = []
  for (let ring = 0; ring < RINGS; ring += 1) {
    const radius = R0 + CELL * ring
    const count = Math.max(8, Math.round((Math.PI * 2 * radius) / CELL))
    const white = ring % 3 === 1
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2 + (ring % 2) * (Math.PI / count)
      const wave = 0.5 + 0.5 * Math.cos(5 * angle + ring * 0.7)
      const size = white ? 0.18 + 0.12 * wave : 0.12 + 0.4 * wave * (0.45 + 0.55 * (radius / R1))
      dots.push({
        x: 50 + Math.cos(angle) * radius * 46,
        y: 50 + Math.sin(angle) * radius * 46,
        r: CELL * 46 * size,
        white,
      })
    }
  }
  return dots
})()

export interface CoverArtProps {
  className?: string
}

/**
 * Portada de una entrada durante el voto ciego (guía §3.4.5): emblema de puntos rojos y blancos sobre
 * el disco granate con la galleta central. Decorativa (`aria-hidden`): la entrada se nombra por su
 * alias. Sin retratos ni nada que identifique a nadie.
 */
export function CoverArt({ className }: CoverArtProps) {
  return (
    <svg viewBox="0 0 100 100" className={cx(styles.cover, className)} aria-hidden="true" focusable="false">
      <circle cx="50" cy="50" r="48.5" className={styles.rim} />
      {DOTS.map((dot) => (
        <circle
          key={`${dot.x.toFixed(2)}-${dot.y.toFixed(2)}`}
          cx={dot.x}
          cy={dot.y}
          r={dot.r}
          className={dot.white ? styles.white : styles.red}
        />
      ))}
      <circle cx="50" cy="50" r="8.5" className={styles.hole} />
      <circle cx="50" cy="50" r="7" className={styles.label} />
      <circle cx="50" cy="50" r="1.4" className={styles.spindle} />
    </svg>
  )
}
