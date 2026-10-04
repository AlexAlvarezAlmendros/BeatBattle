import { type ReactNode, useId } from 'react'
import { t } from '../../i18n'
import { cx } from '../forceState'
import type { ComponentKey } from './anchors'
import styles from './GalleryPage.module.css'
import { type SealState, uncoveredStates } from './stateMatrix'

/** Sección de la galería (`<h2>`), con su ancla para el índice. */
export function GallerySection({
  id,
  title,
  intro,
  children,
}: {
  id: string
  title: string
  intro?: string
  children: ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className={styles.section}>
      <h2 id={`${id}-titulo`} className={styles.sectionTitle}>
        {title}
      </h2>
      {intro && <p className={styles.intro}>{intro}</p>}
      {children}
    </section>
  )
}

/** Bloque de un componente o de un grupo de tokens (`<h3>`), con su ancla. */
export function GalleryBlock({
  id,
  title,
  children,
  stage = false,
}: {
  id: string
  title: string
  children: ReactNode
  /** Fondo con color detrás (como el Silk), para que se vea el cristal. */
  stage?: boolean
}) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className={cx(styles.block, stage && styles.stage)}>
      <h3 id={`${id}-titulo`} className={styles.blockTitle}>
        {title}
      </h3>
      {children}
    </section>
  )
}

/** Subtítulo dentro de un bloque (variante o grupo de estados). */
export function GalleryRow({
  title,
  children,
  wide = false,
}: {
  title?: string
  children: ReactNode
  wide?: boolean
}) {
  return (
    <div className={styles.row}>
      {title && <h4 className={styles.rowTitle}>{title}</h4>}
      <div className={cx(styles.grid, wide && styles.gridWide)}>{children}</div>
    </div>
  )
}

/**
 * Una celda: la pieza en un estado y su nombre debajo. `state` la marca como el estado de §3.3 que
 * enseña (`data-state`), para que el test compruebe la matriz bloque a bloque.
 */
export function StateCell({
  label,
  children,
  span = false,
  state,
}: {
  label: string
  children: ReactNode
  span?: boolean
  state?: SealState
}) {
  return (
    <figure
      className={cx(styles.cell, span && styles.cellSpan)}
      data-state={state}
      data-coverage={state ? 'shown' : undefined}
    >
      <div className={styles.cellStage}>{children}</div>
      <figcaption className={styles.caption}>{label}</figcaption>
    </figure>
  )
}

/**
 * Interruptor accesible (`role="switch"`) para los ajustes de la galería: botón con su estado en
 * `aria-checked`, que se usa con Espacio o Intro.
 */
export function Switch({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  hint?: string
}) {
  const hintId = useId()
  return (
    <div className={styles.switchField}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={hint ? hintId : undefined}
        className={styles.switch}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.switchTrack} aria-hidden="true">
          <span className={styles.switchThumb} />
        </span>
        <span className={styles.switchLabel}>{label}</span>
      </button>
      {hint && (
        <p id={hintId} className={styles.switchHint}>
          {hint}
        </p>
      )}
    </div>
  )
}

/**
 * Fila con los estados de §3.3 que el componente no enseña (`STATE_MATRIX`): una celda por estado con
 * «No aplica» o «Aplazado» y el motivo.
 */
export function StateMatrixRow({ component }: { component: ComponentKey }) {
  const missing = uncoveredStates(component)
  if (missing.length === 0) return null
  return (
    <GalleryRow title={t('dev.gallery.matrix.title')}>
      {missing.map(({ state, coverage }) => (
        <figure key={state} className={styles.cell} data-state={state} data-coverage={coverage.kind}>
          <div className={cx(styles.cellStage, styles.matrixStage)}>
            <p className={styles.matrixReason}>{t(`dev.gallery.matrix.reasons.${coverage.reason}`)}</p>
          </div>
          <figcaption className={styles.caption}>
            {t('dev.gallery.combined', {
              first: t(`dev.gallery.states.${state}`),
              second: t(`dev.gallery.matrix.${coverage.kind}`),
            })}
          </figcaption>
        </figure>
      ))}
    </GalleryRow>
  )
}
