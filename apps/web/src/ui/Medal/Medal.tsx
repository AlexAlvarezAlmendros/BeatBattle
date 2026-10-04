import { t } from '../../i18n'
import { cx } from '../forceState'
import styles from './Medal.module.css'

export type MedalPlace = 1 | 2 | 3

/** Surcos del vinilo, de dentro afuera (unidades del dibujo de 100 × 100). */
const GROOVES = Array.from({ length: 9 }, (_, index) => 20 + index * 3.2)

/**
 * Medalla de vinilo (guía §3.4.3): disco con surcos, canto y galleta del color de su puesto, en la
 * paleta (§3.2 «Medallas»): oro = galleta roja con corona negra; platino = galleta blanca; diamante =
 * galleta granate con filete blanco. Siempre con texto: su nombre accesible es «Disco de oro»… Es el
 * `medal()` de las maquetas (`final.js`) con los colores por token, sin la cifra de la galleta: a
 * 30–40 px salía por debajo de 12 px (`RD-VIS-05`); el puesto lo dicen la galleta, el nombre y la
 * posición escrita al lado.
 */
export function Medal({ place, className }: { place: MedalPlace; className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={cx(styles.medal, className)}
      data-place={place}
      role="img"
      aria-label={t(`ui.medal.place${place}`)}
    >
      <circle cx="50" cy="50" r="48" className={styles.disc} />
      {GROOVES.map((radius) => (
        <circle key={radius} cx="50" cy="50" r={radius} className={styles.groove} />
      ))}
      <path d="M18 30 A38 38 0 0 1 40 13" className={styles.shine} />
      <circle cx="50" cy="50" r="19" className={styles.label} />
      {place === 1 && (
        <path d="M37 56 L35 42 L43 49 L50 38 L57 49 L65 42 L63 56 Z" className={styles.crown} />
      )}
      <circle cx="50" cy="50" r="2.4" className={styles.hole} />
    </svg>
  )
}
