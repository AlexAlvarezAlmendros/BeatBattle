import type { ReactNode } from 'react'
import { t } from '../i18n'
import { Button } from '../ui/Button'
import { Frame } from '../ui/Frame'
import { cx } from '../ui/forceState'
import { Stamp } from '../ui/Stamp'
import { DocumentTitle } from './DocumentTitle'
import { useScreen } from './layout/screen'
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
  /**
   * La pieza protagonista de la pantalla, en la cuña de la izquierda (§3.8.14, maquetas `02-seleccion`
   * y `05-perfil`): la lista de movimientos, el pad de la 404, el logo con su lockup, el sello «EN
   * OBRAS» de las provisionales. Todo lo que lleve texto va en sus propias placas o paneles
   * (`RD-VIS-05`: la cuña tiene trama).
   */
  piece?: ReactNode
  /** Distintivo arriba del panel (el sello «EN OBRAS» cuando la pieza es otra cosa). */
  badge?: ReactNode
  /** Pieza ancha (40 rem en vez de 28): el logo grande de la pantalla de título de la autenticación. */
  wide?: boolean
  /**
   * ¿El título ya se ve en la placa del HUD? Entonces el `<h1>` queda solo para los lectores de
   * pantalla en escritorio (en móvil el HUD no lleva placa y el título se ve). Por defecto, si la ruta
   * declara placa (`handle.screen.plate`).
   */
  titleInHud?: boolean
  /** Las acciones del pie del panel; por defecto, «Volver al menú [ESC]». `null`, ninguna. */
  actions?: ReactNode
  children?: ReactNode
  className?: string
}

/**
 * Plantilla de las pantallas interiores (guía §3.8.14; tareas 0.26 y 0.28): a la izquierda, sobre la
 * cuña, la **pieza** de la pantalla; a la derecha, el contenido en un panel opaco de chaflán grande con
 * «Volver al menú [ESC]» en su pie (Esc hace lo mismo desde cualquier sitio, `useFrameKeys`). El título
 * va una sola vez: en la placa del HUD si la ruta la tiene (el `<h1>` sigue ahí para los lectores de
 * pantalla) o, si no, en display arriba a la izquierda. En móvil, todo apilado y el título visible
 * sobre un panel.
 */
export function ScreenPage({
  title,
  kicker,
  summary,
  documentTitle = title,
  piece,
  badge,
  wide = false,
  titleInHud,
  actions,
  children,
  className,
}: ScreenPageProps) {
  const screen = useScreen()
  const inHud = titleInHud ?? Boolean(screen.plate)
  return (
    <div
      className={cx(styles.screen, className)}
      data-title-in-hud={inHud || undefined}
      data-piece={piece ? '' : undefined}
      data-wide={wide || undefined}
    >
      <DocumentTitle page={documentTitle ?? undefined} />
      <div className={styles.head}>
        {kicker && <p className={cx('bb-label', styles.kicker)}>{kicker}</p>}
        <h1 className={cx('bb-display', styles.title)}>{title}</h1>
      </div>
      {piece && <div className={styles.piece}>{piece}</div>}
      <Frame cut="lg" className={styles.panel}>
        {badge}
        {summary && <p className={styles.summary}>{summary}</p>}
        {children}
        {actions !== null && <div className={styles.actions}>{actions ?? <BackToMenu />}</div>}
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

/**
 * El sello de las pantallas que aún no tienen su contenido (provisionales, 0.10 y 0.26). `big`: como
 * pieza de la cuña (sobre negro, a cuerpo de título).
 */
export function UnderConstruction({ big = false }: { big?: boolean }) {
  return (
    <Stamp tone="red" turn={-0.6} className={cx(styles.stamp, big && styles.stampBig)}>
      {t('screen.underConstruction')}
    </Stamp>
  )
}
