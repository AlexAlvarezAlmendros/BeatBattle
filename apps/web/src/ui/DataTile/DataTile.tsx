import type { HTMLAttributes, ReactNode } from 'react'
import { t } from '../../i18n'
import { cx, forceStateAttr } from '../forceState'
import { Icon, type IconName } from '../Icon'
import { Skeleton } from '../Skeleton'
import styles from './DataTile.module.css'

export type DataTileState = 'rest' | 'hover'

export interface DataTileProps {
  icon: IconName
  /** Etiqueta en mayúsculas pequeñas («BPM», «TONALIDAD»). */
  label: string
  value: ReactNode
  /** Valor aún sin cargar: esqueleto en su lugar y «Cargando…» para lectores de pantalla. */
  loading?: boolean
  /** Cifras en mono tabular (BPM, duración): §3.2, los datos técnicos van en mono. */
  mono?: boolean
  state?: DataTileState
  className?: string
}

/**
 * Tesela de dato (§3.3): las de «▌INFORMACIÓN» en la ficha de beat del sello (`#111`, radio 8, icono
 * rojo, etiqueta diminuta en mayúsculas, valor en negrita), con la etiqueta en `--bb-text-3` para
 * cumplir AA (§3.1). Es un par `<dt>`/`<dd>`: va dentro de un `DataTileList` (`<dl>`).
 */
export function DataTile({
  icon,
  label,
  value,
  loading = false,
  mono = false,
  state,
  className,
}: DataTileProps) {
  return (
    <div className={cx(styles.tile, className)} {...forceStateAttr(state)}>
      <dt className={styles.term}>
        <Icon name={icon} className={styles.icon} />
        <span className={styles.label}>{label}</span>
      </dt>
      <dd className={cx(styles.value, mono && styles.mono)} aria-busy={loading || undefined}>
        {loading ? (
          <>
            <Skeleton width="4.5em" height="1em" />
            <span className="sr-only">{t('ui.skeleton.loading')}</span>
          </>
        ) : (
          value
        )}
      </dd>
    </div>
  )
}

/** Rejilla de teselas: una lista de descripción (`<dl>`). */
export function DataTileList({ className, children, ...rest }: HTMLAttributes<HTMLDListElement>) {
  return (
    <dl {...rest} className={cx(styles.list, className)}>
      {children}
    </dl>
  )
}
