import { type ReactNode, type RefObject, useLayoutEffect, useMemo, useRef } from 'react'
import { t } from '../i18n'
import { Button } from '../ui/Button'
import { Frame } from '../ui/Frame'
import { cx } from '../ui/forceState'
import { type FitTextOptions, useFitText } from '../ui/hooks/useFitText'
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
   * Dónde va la pieza en su columna, en escritorio: centrada en el alto del panel (por defecto) o arriba
   * (`start`), alineada con el panel, para las pantallas cuyo panel puede ser mucho más alto que la
   * ventana (las secciones de Opciones que funcionan: su emblema no debe quedar fuera de la vista).
   */
  pieceAlign?: 'center' | 'start'
  /**
   * Cuerpo mínimo al que puede bajar el título en display antes de partir (por defecto no baja: parte por
   * palabras). Para un título que es una sola palabra larga, el nombre de un productor
   * («PRODUCTORA.NOCTURNA»): mejor más pequeño que partido a mitad (jurado de la 2.25).
   */
  titleMinFontPx?: number
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
 * - `--screen-piece-x` / `--screen-piece-y`: el centro de lo que lleva la columna de la pieza (en dos
 *   columnas va centrado en ella, así que es el de la columna; en una, el sello «EN OBRAS» va a la
 *   izquierda). Es el centro de los rayos (§3.8.14 v0.6.7: «el centro de los rayos sigue a la pieza»; era un
 *   punto fijo de la ventana y en los legales caía ~200 px por encima del sello «EN OBRAS», y en /entrar a
 *   1920 × 1080, arriba a la izquierda del logo; P8): en dos columnas, y en una en el marco simple (la
 *   autenticación, con el logo como pieza de la primera vista, y los legales; sexto pase, G5).
 * - `--screen-piece-right` / `--screen-piece-bottom`: la esquina de abajo a la derecha de lo que lleva esa
 *   columna (la lista de movimientos, el tablero de Opciones, el pad de la 404 con su botón, el sello «EN
 *   OBRAS»). En ventana grande (≥ 1600 px) la cuña de las interiores sigue a la pieza: su diagonal pasa a
 *   la derecha de esa esquina y el granate no pasa del ~24 % (P8). Con la columna entera, las provisionales
 *   (un sello de ~290 px en una columna de 544) se quedaban en el 26,5 % a 1920 × 1080 (quinto pase).
 *
 * Las medidas son las de la pantalla ya en su sitio: descuentan el desplazamiento de la entrada de
 * pantalla (`entryShift`). Sin pestañas o sin pieza (o sin caja: la pieza del móvil bajo de la 404 no hace
 * caja), la variable no se publica y la arena usa su valor de siempre. Se quitan al salir de la pantalla.
 */
export const SCREEN_TABS_BOTTOM_VAR = '--screen-tabs-bottom'
export const SCREEN_PIECE_X_VAR = '--screen-piece-x'
export const SCREEN_PIECE_Y_VAR = '--screen-piece-y'
export const SCREEN_PIECE_RIGHT_VAR = '--screen-piece-right'
export const SCREEN_PIECE_BOTTOM_VAR = '--screen-piece-bottom'

const PIECE_VARS = [SCREEN_PIECE_X_VAR, SCREEN_PIECE_Y_VAR, SCREEN_PIECE_RIGHT_VAR, SCREEN_PIECE_BOTTOM_VAR]

/**
 * Lo que la pantalla está desplazada ahora mismo por un `translate` suyo o de sus antecesores: la entrada de
 * pantalla (`bb-screen-in`, `layout.css`) desliza `.game-screen` desde −40 px. La arena es la de la
 * pantalla ya en su sitio, así que las medidas lo descuentan. Medida a mitad de la entrada, tras navegar
 * con movimiento (del menú a «Cómo se juega», Q/E en Opciones o en los legales), la geometría se quedaba
 * 30–40 px a la izquierda: al acabar la entrada nada cambia de tamaño y no se volvía a medir (quinto pase
 * del jurado). Solo cuenta lo que va en px (la entrada no usa porcentajes).
 */
function entryShift(element: Element): { x: number; y: number } {
  let x = 0
  let y = 0
  for (let node: Element | null = element; node; node = node.parentElement) {
    const translate = getComputedStyle(node).translate
    if (!translate || translate === 'none') continue
    const [tx = '0px', ty = '0px'] = translate.split(' ')
    if (tx.endsWith('px')) x += Number.parseFloat(tx)
    if (ty.endsWith('px')) y += Number.parseFloat(ty)
  }
  return { x, y }
}

/** Publica en `<html>` la geometría de las pestañas y de la pieza de la pantalla (ver arriba). */
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
      // De la ventana a la página, con la pantalla en su sitio.
      const shift = entryShift(root)
      const dx = window.scrollX - shift.x
      const dy = window.scrollY - shift.y
      const tabs = part('tabs')?.getBoundingClientRect()
      if (tabs && tabs.height >= 1) set(SCREEN_TABS_BOTTOM_VAR, tabs.bottom + dy)
      else clear([SCREEN_TABS_BOTTOM_VAR])
      const column = part('piece')
      const piece = column?.getBoundingClientRect()
      if (column && piece && piece.width >= 1 && piece.height >= 1) {
        // La caja de lo que lleva la columna (sin nada con caja, la de la columna).
        let left = Number.POSITIVE_INFINITY
        let top = Number.POSITIVE_INFINITY
        let right = Number.NEGATIVE_INFINITY
        let bottom = Number.NEGATIVE_INFINITY
        for (const child of column.children) {
          const box = child.getBoundingClientRect()
          if (box.width < 1 || box.height < 1) continue
          left = Math.min(left, box.left)
          top = Math.min(top, box.top)
          right = Math.max(right, box.right)
          bottom = Math.max(bottom, box.bottom)
        }
        const content = Number.isFinite(left) ? { left, top, right, bottom } : piece
        set(SCREEN_PIECE_X_VAR, (content.left + content.right) / 2 + dx)
        set(SCREEN_PIECE_Y_VAR, (content.top + content.bottom) / 2 + dy)
        set(SCREEN_PIECE_RIGHT_VAR, content.right + dx)
        set(SCREEN_PIECE_BOTTOM_VAR, content.bottom + dy)
      } else clear(PIECE_VARS)
    }
    update()
    // Cambiar las variables no cambia el tamaño de la pantalla: se puede actualizar dentro del aviso. La
    // pantalla cambia de tamaño con la letra, la ventana o el contenido; la pieza, al cambiar de sección.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(root)
    for (const name of ['tabs', 'piece']) {
      const element = part(name)
      if (element) observer?.observe(element)
    }
    for (const child of part('piece')?.children ?? []) observer?.observe(child)
    window.addEventListener('resize', update)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', update)
      clear([SCREEN_TABS_BOTTOM_VAR, ...PIECE_VARS])
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
 * Ajuste del título en display (§3.8.14, `RD-VIS-05`; sexto pase del jurado, G2): en una línea mientras
 * quepa, bajando la anchura de Anybody desde la de la placa (`--bb-stretch-plate`, 125 %) hasta
 * `--bb-stretch-min` (105 %); si ni así cabe, parte por palabras con el interlineado que deja sitio a la
 * sombra dura (`ScreenPage.module.css`). El cuerpo no baja (es el de la placa del HUD): solo una palabra
 * que no quepa sola baja hasta 12 px antes que cortarse (`useFitText`). A 320 y 360 px «BONUS / STAGE»,
 * «LETRA / PEQUEÑA» y «CÓMO SE / JUEGA» partían y la sombra roja de la primera línea tocaba la segunda.
 */
const TITLE_FIT: FitTextOptions = { fromStretch: '--bb-stretch-plate', minFontPx: Number.POSITIVE_INFINITY }

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
  pieceAlign = 'center',
  titleMinFontPx,
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
  // El título que se ve: el `<h1>` (en la cabeza o en el panel) o, si va en otro sitio, el de la placa.
  const headingRef = useRef<HTMLHeadingElement>(null)
  const plateTitleRef = useRef<HTMLParagraphElement>(null)
  const plateTitle = screen.plate ? t(screen.plate.title) : title
  const titleFit = titleMinFontPx ? { ...TITLE_FIT, minFontPx: titleMinFontPx } : TITLE_FIT
  useFitText(headingRef, titlePlacement === 'tabs' ? '' : title, titleFit)
  useFitText(plateTitleRef, titlePlacement === 'head' ? '' : plateTitle, titleFit)
  const heading = (
    <h1
      ref={headingRef}
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
      data-piece-align={pieceAlign === 'start' ? 'start' : undefined}
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
            <p ref={plateTitleRef} className={cx('bb-display', styles.title)}>
              {plateTitle}
            </p>
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
