import type { HTMLAttributes, ReactNode } from 'react'
import { Frame } from '../Frame'
import { cx } from '../forceState'
import styles from './Chip.module.css'

export interface DataChipProps extends HTMLAttributes<HTMLSpanElement> {
  /** El dato («92», «1:12», «Re menor»). En Oxanium si son cifras. */
  value: ReactNode
  /** Unidad o rótulo en 12 px («BPM», «MIN», «SUGERIDO»). */
  unit?: ReactNode
  /** La unidad va delante del valor («SUGERIDO Boom bap»). */
  unitFirst?: boolean
  /** El valor es una palabra (tonalidad, género): Chakra Petch en vez de Oxanium. */
  word?: boolean
}

/**
 * Chip de dato (guía §3.3): chaflán `--bb-cut-sm`, 32 px, valor en Oxanium y unidad en rótulo de
 * 12 px («92 BPM», «Re menor», «2:51»). No es interactivo. Las tonalidades van en palabras (§3.2).
 */
export function DataChip({
  value,
  unit,
  unitFirst = false,
  word = false,
  className,
  ...rest
}: DataChipProps) {
  const unitNode = unit !== undefined && <small className={styles.unit}>{unit}</small>
  return (
    <Frame as="span" cut="sm" {...rest} className={cx(styles.dataChip, word && styles.word, className)}>
      {unitFirst && unitNode}
      <span className={styles.value}>{value}</span>
      {!unitFirst && unitNode}
    </Frame>
  )
}
