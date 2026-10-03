import { type ReactNode, useId } from 'react'
import { t } from '../../i18n'
import { Frame } from '../Frame'
import { cx } from '../forceState'
import styles from './kit.module.css'

/**
 * Piezas de la galería en la arena: sección (`<h2>`), bloque (`<h3>`), fila, muestra e interruptor.
 * Las usan las secciones de `sections/`; las viejas siguen con `parts.tsx` hasta que se rehacen.
 */

/** Sección (`<h2>` con su filete), con el `id` que la registra en el índice. */
export function GallerySection({
  id,
  title,
  intro,
  children,
}: {
  id: string
  title: string
  intro?: ReactNode
  children: ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className={styles.section}>
      <h2 id={`${id}-titulo`} className={cx('bb-display', styles.sectionTitle)}>
        {title}
      </h2>
      {intro && <p className={styles.intro}>{intro}</p>}
      {children}
    </section>
  )
}

/** Bloque (`<h3>`), con su ancla del índice. */
export function GalleryBlock({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className={styles.block}>
      <h3 id={`${id}-titulo`} className={cx('bb-display', styles.blockTitle)}>
        {title}
      </h3>
      {children}
    </section>
  )
}

/** Grupo de muestras con un rótulo (`<h4>`). */
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
    <div>
      {title && <h4 className={cx('bb-label', styles.rowTitle)}>{title}</h4>}
      <div className={cx(styles.grid, wide && styles.gridWide)}>{children}</div>
    </div>
  )
}

/** Una muestra: la pieza en su escenario y el pie con su nombre y, si lo hay, su token. */
export function Specimen({
  label,
  token,
  children,
  className,
}: {
  label: string
  token?: string
  children: ReactNode
  className?: string
}) {
  return (
    <figure className={styles.specimen}>
      <Frame cut="md" className={cx(styles.stage, className)}>
        {children}
      </Frame>
      <figcaption className={styles.caption}>
        <span>{label}</span>
        {token && <code className={styles.token}>{token}</code>}
      </figcaption>
    </figure>
  )
}

/**
 * Interruptor (`role="switch"`) de los ajustes de la galería, con la forma del chip de filtro de la
 * arena: su estado en texto («SÍ/NO»), 44 px de alto, Espacio o Intro.
 */
export function GallerySwitch({
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
      <Frame
        as="button"
        type="button"
        cut="sm"
        role="switch"
        aria-checked={checked}
        aria-describedby={hint ? hintId : undefined}
        className={styles.switch}
        onClick={() => onChange(!checked)}
      >
        {label}
        <span className={styles.yesNo} aria-hidden="true">
          <span className={checked ? styles.on : undefined}>{t('dev.gallery.controls.yes')}</span>
          <span className={checked ? undefined : styles.on}>{t('dev.gallery.controls.no')}</span>
        </span>
      </Frame>
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
    </div>
  )
}
