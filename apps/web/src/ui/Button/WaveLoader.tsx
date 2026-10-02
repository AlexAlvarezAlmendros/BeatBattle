import type { CSSProperties } from 'react'
import { cx } from '../forceState'
import styles from './Button.module.css'

/** Barras de la onda de carga (§3.3: «una onda de 5 barras animadas»). */
export const WAVE_LOADER_BARS = 5

/**
 * Onda de 5 barras que sustituye al texto de un botón mientras carga. Es decorativa
 * (`aria-hidden`): el estado lo anuncian `aria-busy` y el texto accesible del botón. Con «reducir
 * movimiento» queda quieta, como una onda dibujada (Anexo E: sin bucles).
 */
export function WaveLoader({ className }: { className?: string }) {
  return (
    <span className={cx(styles.loader, className)} aria-hidden="true" data-wave-loader="">
      {Array.from({ length: WAVE_LOADER_BARS }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: barras fijas, sin reordenar
        <span key={i} className={styles.loaderBar} style={{ '--i': i } as CSSProperties} />
      ))}
    </span>
  )
}
