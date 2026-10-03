import type { ReactNode } from 'react'
import { t } from '../i18n'
import { Button } from '../ui/Button'
import { Frame } from '../ui/Frame'
import { cx } from '../ui/forceState'
import { Stamp } from '../ui/Stamp'
import { DocumentTitle } from './DocumentTitle'
import { paths } from './paths'
import styles from './ScreenPage.module.css'

export interface ScreenPageProps {
  /** Título de la pantalla: el `<h1>`, en display (ya traducido). */
  title: string
  /** Rótulo encima del título (ya traducido). */
  kicker?: string
  /** Una o dos líneas que cuentan la pantalla (ya traducidas), arriba del panel. */
  summary?: ReactNode
  /** Título de la pestaña; por defecto, el propio `title`. `null` deja el de la marca. */
  documentTitle?: string | null
  /** Lo que va a la izquierda, bajo el título (el logo de las pantallas de título, un sello…). */
  aside?: ReactNode
  /** Las acciones del pie del panel; por defecto, «Volver al menú [ESC]». */
  actions?: ReactNode
  children?: ReactNode
  className?: string
}

/**
 * Plantilla de las pantallas interiores (guía §3.8.14; tarea 0.26): el título de la pantalla en
 * display a la izquierda, sobre la cuña (en su zona sin trama), y el contenido en un panel opaco de
 * chaflán grande a la derecha, con «Volver al menú [ESC]» en su pie (Esc hace lo mismo desde
 * cualquier sitio, `useFrameKeys`). La placa de título del HUD sale de la ruta (`handle.screen`). En
 * móvil, todo apilado.
 */
export function ScreenPage({
  title,
  kicker,
  summary,
  documentTitle = title,
  aside,
  actions,
  children,
  className,
}: ScreenPageProps) {
  return (
    <div className={cx(styles.screen, className)}>
      <DocumentTitle page={documentTitle ?? undefined} />
      <div className={styles.head}>
        {kicker && <p className={cx('bb-label', styles.kicker)}>{kicker}</p>}
        <h1 className={cx('bb-display', styles.title)}>{title}</h1>
        {aside}
      </div>
      <Frame cut="lg" className={styles.panel}>
        {summary && <p className={styles.summary}>{summary}</p>}
        {children}
        <div className={styles.actions}>{actions ?? <BackToMenu />}</div>
      </Frame>
    </div>
  )
}

/** «Volver al menú [ESC]» (§3.4.1: la tecla de volver de la barra de controles). */
export function BackToMenu() {
  return (
    <Button variant="outline" to={paths.home()} keyHint={t('frame.keys.glyph.escape')}>
      {t('screen.backToMenu')}
    </Button>
  )
}

/** El sello de las pantallas que aún no tienen su contenido (provisionales, 0.10 y 0.26). */
export function UnderConstruction() {
  return (
    <Stamp tone="red" turn={-0.6} className={styles.stamp}>
      {t('screen.underConstruction')}
    </Stamp>
  )
}
