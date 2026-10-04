import { type ReactNode, type RefObject, useLayoutEffect, useMemo, useRef } from 'react'
import { t } from '../i18n'
import { Button } from '../ui/Button'
import { Frame } from '../ui/Frame'
import { cx } from '../ui/forceState'
import { useIdleMenuKeys } from '../ui/hooks/useIdleMenuKeys'
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
  /**
   * Las pestañas de la pantalla (las secciones de Opciones), a todo lo ancho, después de la cabeza y
   * antes de la pieza y el panel: en móvil, la pantalla abre con su rótulo y su título y las pestañas
   * van debajo, como se leen (tercer pase del jurado, L3).
   */
  tabs?: ReactNode
  /**
   * Reparto de la pantalla. `interior` (por defecto): la pieza a la izquierda y el panel a su lado, del
   * mismo alto, con el bloque centrado entre el HUD y la barra (§3.8.14 «Reparto del alto»). `title`: la
   * pantalla de título de la autenticación (maqueta `00-titulo`), con la pieza ancha (el logo grande con
   * su lockup) y el bloque centrado en vertical entre el HUD y la barra, con el pie del panel a la altura
   * del de la pieza; en móvil, la pieza en medio y el panel anclado al pie, encima de la barra.
   */
  layout?: 'interior' | 'title'
  /**
   * Pantalla de **contenido** (selección, ficha, perfil, resultados, salón de la fama, archivo; §3.8.14):
   * llena el alto entre el HUD y la barra en escritorio (≥ 961 px), como sus maquetas (`02-seleccion`,
   * `05-perfil`): la pieza y el panel se estiran hasta la barra y cada uno reparte lo suyo. La pieza pasa
   * a ser una columna flexible para que la pantalla diga qué crece y qué va al pie. Si no cabe, se
   * desplaza. Las de poco contenido («Cómo se juega», Opciones, la 404, los legales y las provisionales)
   * no lo llevan: no estiran cajas, centran su bloque.
   */
  fill?: boolean
  /**
   * El panel va antes que la pieza en el orden de lectura y del foco y, en la columna única (≤ 960 px),
   * también en pantalla; en dos columnas siguen la pieza a la izquierda y el panel a la derecha. Para
   * la 404, cuyo subtítulo va con el titular (§3.8.11).
   */
  panelFirst?: boolean
  /**
   * Dónde va el `<h1>` (§3.8.14). `head` (por defecto): en la cabeza, con su rótulo; en escritorio, si
   * la ruta tiene placa en el HUD, solo para los lectores de pantalla. `panel`: el título del panel, a
   * la vista (los legales: sus pestañas son rótulos cortos y el nombre completo va aquí). `tabs`: solo
   * para los lectores de pantalla, delante de las pestañas, porque la pestaña elegida ya nombra la
   * sección (Opciones). En los dos casos que no son `head`, la cabeza de móvil (donde el HUD no lleva
   * placa) enseña el rótulo y el título de la placa del HUD («OPCIONES · AJUSTES», «LEGAL · LETRA
   * PEQUEÑA»), antes de las pestañas: el título de móvil no repite la pestaña elegida.
   */
  titlePlacement?: 'head' | 'panel' | 'tabs'
  /**
   * ¿El título ya se ve en la placa del HUD? Entonces el `<h1>` queda solo para los lectores de
   * pantalla en escritorio (en móvil el HUD no lleva placa y el título se ve). Por defecto, si la ruta
   * declara placa (`handle.screen.plate`).
   */
  titleInHud?: boolean
  /** Las acciones del pie del panel; por defecto, «Volver al menú [ESC]». `null`, ninguna. */
  actions?: ReactNode
  /**
   * «Volver al menú» del pie es el **primer elemento de juego** de la pantalla (§3.8.14): lleva el
   * cursor al cargar y ↑↓ e Intro van a él con el foco en ningún control. Lo dice cada pantalla, no se
   * deduce: solo las que no tienen otro (las provisionales y la pantalla de error). Las que tienen
   * pestañas, su propio menú o un formulario no lo llevan: su primer elemento de juego es la pestaña
   * actual, el primer movimiento o el primer campo (la autenticación de la Fase 2).
   */
  backIsStart?: boolean
  children?: ReactNode
  className?: string
}

/**
 * El primer elemento de juego de la pantalla (§3.8.14): la pestaña de la sección actual (Opciones, los
 * legales) o el que se marca con `data-idle-start` («Volver al menú» en la 404, en la pantalla de error
 * y en las provisionales sin pestañas, la autenticación incluida mientras no tenga formulario:
 * `backIsStart`). Las pantallas con su propio menú de juego («Cómo se juega») no marcan nada: sus flechas
 * las lleva su menú.
 */
const IDLE_START = '[data-screen-part="tabs"] [aria-current="page"], [data-idle-start]'

/**
 * Variables con la geometría de la pantalla que lee la arena (`ArenaBackdrop.module.css`), en px desde la
 * esquina de arriba a la izquierda de la página (con la página sin desplazar, que es cuando la arena fija
 * y la pantalla coinciden):
 *
 * - `--screen-tabs-bottom`: el pie de las pestañas. Por debajo de 360 px, donde ocupan varias filas, la
 *   cuña empieza bajo ellas (§3.8.14 v0.6.7; cuarto pase del jurado, P3).
 *
 * Sin pestañas, la variable no se publica y la arena usa su valor de siempre. Se quita al salir de la
 * pantalla.
 */
export const SCREEN_TABS_BOTTOM_VAR = '--screen-tabs-bottom'

/** Publica en `<html>` la geometría de las pestañas de la pantalla (ver arriba). */
function useArenaGeometry(rootRef: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const html = document.documentElement
    const part = (name: string) => root.querySelector<HTMLElement>(`:scope > [data-screen-part="${name}"]`)
    const set = (name: string, value: number) => html.style.setProperty(name, `${Math.round(value)}px`)
    const clear = (names: readonly string[]) => {
      for (const name of names) html.style.removeProperty(name)
    }
    const update = () => {
      const tabs = part('tabs')?.getBoundingClientRect()
      if (tabs && tabs.height >= 1) set(SCREEN_TABS_BOTTOM_VAR, tabs.bottom + window.scrollY)
      else clear([SCREEN_TABS_BOTTOM_VAR])
    }
    update()
    // Cambiar las variables no cambia el tamaño de la pantalla: se puede actualizar dentro del aviso. La
    // pantalla cambia de tamaño con la letra, la ventana o el contenido.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(root)
    const tabs = part('tabs')
    if (tabs) observer?.observe(tabs)
    window.addEventListener('resize', update)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', update)
      clear([SCREEN_TABS_BOTTOM_VAR])
    }
  }, [rootRef])
}

/**
 * Intro con el foco en ningún control **enfoca** el primer elemento de juego, como ↑↓ (§3.8.14: «van al
 * primer elemento de juego… y lo marcan con el cursor»); no lo acciona. La Intro siguiente, ya con el
 * foco en él, lo acciona de forma nativa. Accionarlo rebotaba entre pantallas: al cambiar de pantalla
 * el foco va al `<main>`, que cuenta como reposo, y una segunda Intro (o la tecla mantenida) volvía al
 * menú (revisión de la 0.28).
 */
function focusStart(element: HTMLElement) {
  element.focus()
}

/**
 * Plantilla de las pantallas interiores (guía §3.8.14; tareas 0.26 y 0.28): a la izquierda, sobre la
 * cuña, la **pieza** de la pantalla; a la derecha, el contenido en un panel opaco de chaflán grande con
 * «Volver al menú [ESC]» en su pie (Esc hace lo mismo desde cualquier sitio, `useFrameKeys`). El título
 * va una sola vez: en la placa del HUD si la ruta la tiene (el `<h1>` sigue ahí para los lectores de
 * pantalla) o, si no, en display arriba a la izquierda. En móvil, todo apilado y el título visible
 * sobre un panel.
 *
 * Teclado (§3.8.14, `RD-VIS-02` d): el primer elemento de juego (`IDLE_START`) lleva el cursor al
 * cargar, sin robar el foco (el primer Tab sigue siendo «Saltar al contenido»), y con el foco en ningún
 * control ↑↓, Inicio, Fin e Intro van a él y lo marcan con el cursor (`useIdleMenuKeys`); Intro no lo
 * acciona (`focusStart`).
 */
export function ScreenPage({
  title,
  kicker,
  summary,
  documentTitle = title,
  piece,
  badge,
  tabs,
  layout = 'interior',
  fill = false,
  panelFirst = false,
  titleInHud,
  titlePlacement = 'head',
  actions,
  backIsStart = false,
  children,
  className,
}: ScreenPageProps) {
  const screen = useScreen()
  const inHud = titleInHud ?? Boolean(screen.plate)
  const rootRef = useRef<HTMLDivElement>(null)
  // Un menú de una sola opción, el primer elemento de juego: moverse es enfocarlo.
  const start = useMemo(
    () => ({
      activeIndex: 0,
      moveTo: () => rootRef.current?.querySelector<HTMLElement>(IDLE_START)?.focus(),
    }),
    [],
  )
  useIdleMenuKeys(start, 1, rootRef, { itemSelector: IDLE_START, activate: focusStart })
  useArenaGeometry(rootRef)
  const heading = (
    <h1
      className={
        titlePlacement === 'tabs'
          ? 'sr-only'
          : cx('bb-display', titlePlacement === 'panel' ? styles.panelTitle : styles.title)
      }
    >
      {title}
    </h1>
  )
  const panel = (
    <Frame cut="lg" className={styles.panel} data-screen-part="panel">
      {titlePlacement === 'panel' && heading}
      {(badge || summary) && (
        <div className={styles.intro}>
          {badge}
          {summary && <p className={styles.summary}>{summary}</p>}
        </div>
      )}
      {children}
      {actions !== null && (
        <div className={styles.actions}>{actions ?? <BackToMenu start={backIsStart} />}</div>
      )}
    </Frame>
  )
  return (
    <div
      ref={rootRef}
      className={cx(styles.screen, className)}
      data-title-in-hud={inHud || undefined}
      data-piece={piece ? '' : undefined}
      data-tabs={tabs ? '' : undefined}
      data-layout={layout}
      data-fill={fill || undefined}
      data-panel-first={panelFirst || undefined}
    >
      <DocumentTitle page={documentTitle ?? undefined} />
      {titlePlacement === 'head' ? (
        <div className={styles.head} data-screen-part="head">
          {kicker && <p className={cx('bb-label', styles.kicker)}>{kicker}</p>}
          {heading}
        </div>
      ) : (
        // La placa del HUD, en la cabeza de móvil: dibujo, como la placa (el <h1> va en otro sitio).
        <>
          {titlePlacement === 'tabs' && heading}
          <div className={styles.head} data-screen-part="head" aria-hidden="true">
            <p className={cx('bb-label', styles.kicker)}>{screen.plate ? t(screen.plate.kicker) : kicker}</p>
            <p className={cx('bb-display', styles.title)}>{screen.plate ? t(screen.plate.title) : title}</p>
          </div>
        </>
      )}
      {tabs && (
        <div className={styles.tabs} data-screen-part="tabs">
          {tabs}
        </div>
      )}
      {panelFirst && panel}
      {piece && (
        <div className={styles.piece} data-screen-part="piece">
          {piece}
        </div>
      )}
      {!panelFirst && panel}
    </div>
  )
}

/**
 * «Volver al menú [ESC]» (§3.4.1: la tecla de volver de la barra de controles). `start`: es el primer
 * elemento de juego de la pantalla (§3.8.14; la 404, las provisionales y la pantalla de error): lleva el
 * cursor mientras el foco no esté en él, como la opción elegida de un menú, y ↑↓ e Intro van a él con el
 * foco en ningún control (`ScreenPage`).
 */
export function BackToMenu({ start = false }: { start?: boolean }) {
  const button = (
    <Button
      variant="outline"
      to={paths.home()}
      keyHint={t('frame.keys.glyph.escape')}
      {...(start ? { 'data-idle-start': '', 'data-cursor-active': 'true' } : {})}
    >
      {t('screen.backToMenu')}
    </Button>
  )
  return start ? (
    <span className={styles.startGroup} data-cursor-group="">
      {button}
    </span>
  ) : (
    button
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
