import { type ReactNode, useId } from 'react'
import { cx } from '../forceState'
import styles from './GalleryPage.module.css'

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

/** Una celda: la pieza en un estado y su nombre debajo. */
export function StateCell({
  label,
  children,
  span = false,
}: {
  label: string
  children: ReactNode
  span?: boolean
}) {
  return (
    <figure className={cx(styles.cell, span && styles.cellSpan)}>
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
