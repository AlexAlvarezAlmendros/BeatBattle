import { type ReactNode, useId, useState } from 'react'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { cx } from '../forceState'
import { Icon } from '../Icon'
import { SectionLabel } from '../SectionLabel'
import { DataTileList } from './DataTile'
import styles from './DataTile.module.css'

/**
 * Ancho por debajo del cual las teselas pasan a lista y el rótulo las pliega: el corte de la ficha de
 * beat del sello (`BeatDetalle.css`, `@media (max-width: 768px)`). El mismo que el CSS de las teselas.
 */
export const DATA_TILE_COMPACT_QUERY = '(max-width: 768px)'

export interface DataTileSectionProps {
  /** Rótulo de la sección («Información»), ya traducido. */
  title: string
  /** Nivel del encabezado del rótulo (por defecto `h2`). */
  titleAs?: 'h2' | 'h3' | 'h4'
  /** En móvil, la lista empieza desplegada (en el sello empieza plegada). */
  defaultExpanded?: boolean
  /** Las teselas (`DataTile`). */
  children: ReactNode
  className?: string
  /** Clase de la lista (`<dl>`). */
  listClassName?: string
}

/**
 * Rótulo de sección con sus teselas de dato, como «▌INFORMACIÓN» en la ficha de beat del sello.
 *
 * - En escritorio, el rótulo es un encabezado y las teselas van en rejilla.
 * - En móvil (≤ 768 px), las teselas son una lista de clave y valor (`DataTile.module.css`) y el rótulo
 *   la pliega: un botón dentro del encabezado con `aria-expanded` y un chevron, plegado al principio
 *   como en el sello. Con «reducir movimiento», el chevron gira sin transición.
 */
export function DataTileSection({
  title,
  titleAs = 'h2',
  defaultExpanded = false,
  children,
  className,
  listClassName,
}: DataTileSectionProps) {
  const compact = useMediaQuery(DATA_TILE_COMPACT_QUERY)
  const [expanded, setExpanded] = useState(defaultExpanded)
  const listId = useId()
  const open = !compact || expanded

  return (
    <div className={cx(styles.section, className)}>
      {compact ? (
        <SectionLabel as={titleAs} className={styles.sectionHeading}>
          <button
            type="button"
            className={styles.sectionToggle}
            aria-expanded={expanded}
            aria-controls={listId}
            onClick={() => setExpanded((value) => !value)}
          >
            <span>{title}</span>
            <Icon name="chevronDown" className={styles.chevron} />
          </button>
        </SectionLabel>
      ) : (
        <SectionLabel as={titleAs}>{title}</SectionLabel>
      )}
      <DataTileList id={listId} className={listClassName} hidden={!open}>
        {children}
      </DataTileList>
    </div>
  )
}
