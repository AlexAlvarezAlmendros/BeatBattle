import type { HTMLAttributes, ReactNode } from 'react'
import { t } from '../../i18n'
import { frameAttributes } from '../Frame'
import { cx } from '../forceState'
import { Skeleton } from '../Skeleton'
import styles from './DataTile.module.css'

export interface DataTileProps {
  /** Rótulo de 12 px en mayúsculas («TEMPO», «MEJOR PUESTO»). */
  label: string
  /** Valor en Oxanium de 22–24 px («94», «Re menor»). */
  value: ReactNode
  /** Unidad de 12–13 px tras el valor («BPM», «sem.»). */
  unit?: ReactNode
  /** El valor es una palabra (tonalidad, género): Chakra Petch en vez de Oxanium. */
  word?: boolean
  /** `tile--hot`: borde rojo para el dato destacado. */
  hot?: boolean
  /** Valor aún sin cargar: esqueleto en su lugar y «Cargando…» para lectores de pantalla. */
  loading?: boolean
  className?: string
}

/**
 * Tesela / estadística (guía §3.3; maquetas `final.css` `.tile`): marco de chaflán `--bb-cut-md` con
 * rótulo de 12 px y valor en Oxanium de 22–24 px con su unidad. `hot`: borde rojo. Es un par
 * `<dt>`/`<dd>` dentro de una `DataTileList` (`<dl>`). En móvil, la lista pasa a filas de clave y
 * valor.
 */
export function DataTile({
  label,
  value,
  unit,
  word = false,
  hot = false,
  loading = false,
  className,
}: DataTileProps) {
  return (
    <div {...frameAttributes({ cut: 'md' })} className={cx(styles.tile, hot && styles.hot, className)}>
      <dt className={styles.label}>{label}</dt>
      <dd className={cx(styles.value, word && styles.word)} aria-busy={loading || undefined}>
        {loading ? (
          <>
            <Skeleton width="4.5em" height="1em" />
            <span className="sr-only">{t('ui.skeleton.loading')}</span>
          </>
        ) : (
          <>
            {value}
            {unit !== undefined && <span className={styles.unit}> {unit}</span>}
          </>
        )}
      </dd>
    </div>
  )
}

/** Rejilla de teselas: una lista de descripción (`<dl>`). `columns` fija cuántas por fila. */
export function DataTileList({
  className,
  columns,
  style,
  children,
  ...rest
}: HTMLAttributes<HTMLDListElement> & { columns?: number }) {
  return (
    <dl
      {...rest}
      className={cx(styles.list, className)}
      style={columns ? { ...style, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : style}
    >
      {children}
    </dl>
  )
}
