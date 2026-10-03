import { type FocusEvent, useLayoutEffect, useRef } from 'react'
import {
  NavigationType,
  NavLink,
  useLocation,
  useNavigate,
  useNavigation,
  useNavigationType,
} from 'react-router'
import { t } from '../../i18n'
import { Cursor } from '../Cursor'
import { cx } from '../forceState'
import { isCharacterKey, isEditableTarget, listNavigation } from '../hooks/roving'
import { useRovingCore } from '../hooks/useRoving'
import { Key } from '../Key'
import { singleKeyAllowed } from '../shortcuts'
import styles from './Tabs.module.css'

export interface TabLink {
  to: string
  label: string
}

/**
 * Estado de navegación de un cambio de sección con Q/E hecho con el foco en las pestañas: el foco se
 * queda en ellas (en la pestaña de la sección nueva) en vez de ir al `<main>` (`RootLayout`).
 */
const KEEP_TAB_FOCUS = { keepTabFocus: true } as const

/**
 * ¿Esta navegación pide dejar el foco en las pestañas? Solo si es nueva (`PUSH`): el estado se queda en
 * la entrada del historial, y al recargar o al volver atrás (`POP`) el foco va donde siempre.
 */
export function keepsTabFocus(state: unknown, navigationType: NavigationType): boolean {
  return (
    navigationType !== NavigationType.Pop &&
    typeof state === 'object' &&
    state !== null &&
    (state as { keepTabFocus?: unknown }).keepTabFocus === true
  )
}

/**
 * Pestañas que son secciones con su propia URL (guía §3.8.14: las de Opciones; los documentos legales):
 * enlaces con la forma de las pestañas de §3.3 (paralelogramos de 44 px, la activa en blanco) y `[Q]`
 * `[E]` a los lados, que van a la sección anterior y a la siguiente desde cualquier parte de la
 * pantalla (con los atajos de una tecla apagados, solo con el foco en ellas: `ui/shortcuts.ts`). Son
 * navegación (`<nav>` con `aria-current`), no un `tablist`: cada una carga su pantalla.
 *
 * Se recorren como un menú de juego (§3.3 «El foco es el cursor», `RD-MOT-05`): una sola parada de
 * tabulación (la sección actual), ←/→ mueven el foco y el cursor entre las pestañas (en bucle), Inicio
 * y Fin van a la primera y a la última, e Intro (o espacio) entra en la del cursor. Las flechas no
 * cambian de sección: cada una carga una pantalla. Al salir del grupo, la parada vuelve a la actual.
 *
 * Si Q/E se pulsan con el foco en las pestañas, el foco (y el cursor) pasa a la pestaña de la sección
 * nueva en lugar de al `<main>`: así la siguiente Q/E sigue valiendo, también con los atajos apagados
 * (WCAG 2.1.4, `RNF-A11Y-08`).
 */
export function TabLinks({
  label,
  links,
  className,
}: {
  label: string
  links: readonly TabLink[]
  className?: string
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const navigationType = useNavigationType()
  const indexOf = (path: string) =>
    links.findIndex((link) => path === link.to || path.startsWith(`${link.to}/`))
  const current = indexOf(location.pathname)
  /*
   * Sección a la que se va: la de la navegación en curso si su ruta aún está cargando (los legales
   * tienen loader), y la última pedida si la tecla llega antes de que el router lo pinte. Así dos E
   * seguidas avanzan dos secciones y no repiten la primera. Si la navegación en curso va a otra parte
   * (Esc → el menú), se parte de la sección actual: antes se partía de la primera.
   */
  const pending = useNavigation().location?.pathname
  const pendingIndex = pending === undefined ? -1 : indexOf(pending)
  const target = pendingIndex >= 0 ? pendingIndex : current
  const requested = useRef<number | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: se olvida la pedida cuando el router la alcanza
  useLayoutEffect(() => {
    requested.current = null
  }, [target])
  const navRef = useRef<HTMLElement>(null)
  const roving = useRovingCore<HTMLAnchorElement>({
    count: links.length,
    initialIndex: Math.max(0, current),
    hoverMoves: false,
    navigate: (key, index) => listNavigation(key, index, links.length, { orientation: 'horizontal' }),
  })
  const { moveTo } = roving

  /*
   * Q/E. Se escucha desde un efecto de diseño, no uno normal: cada pantalla monta sus pestañas de nuevo
   * (`RootLayout` pone la pantalla con su ruta de `key`), y el efecto normal de las nuevas llegaba
   * después de pintar. Entre medias, con el foco ya en la pestaña nueva, la tecla la recibía el oyente de
   * las pestañas viejas, que no la contenían: con los atajos apagados, la segunda de dos E seguidas se
   * perdía (una de cada cinco veces en el E2E).
   */
  useLayoutEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || !isCharacterKey(event) || isEditableTarget(event.target))
        return
      const key = event.key.toLowerCase()
      if (key !== 'q' && key !== 'e') return
      const inside = navRef.current?.contains(document.activeElement) ?? false
      // Atajo de una tecla: con los atajos apagados, solo con el foco en las pestañas (WCAG 2.1.4).
      if (!singleKeyAllowed(inside)) return
      event.preventDefault()
      const from = Math.max(0, requested.current ?? target)
      const next = (from + (key === 'e' ? 1 : -1) + links.length) % links.length
      requested.current = next
      void navigate(links[next]!.to, inside ? { state: KEEP_TAB_FOCUS } : undefined)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [target, links, navigate])

  // En cada navegación, la parada de tabulación pasa a la sección nueva; tras Q/E desde las pestañas,
  // también el foco. Antes de pintar (`useLayoutEffect`): con un efecto normal quedaba un instante con el
  // foco en `<body>`, y una Q/E pulsada justo entonces, con los atajos apagados, se perdía.
  // biome-ignore lint/correctness/useExhaustiveDependencies: en cada navegación (su `key`), no en cada render
  useLayoutEffect(() => {
    moveTo(Math.max(0, current), { focus: keepsTabFocus(location.state, navigationType) })
  }, [location.key])

  // Al salir del grupo con el cursor en otra pestaña, la parada vuelve a la sección actual.
  const onBlur = (event: FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget
    if (next instanceof Node && event.currentTarget.contains(next)) return
    moveTo(Math.max(0, current), { focus: false })
  }

  return (
    <nav ref={navRef} aria-label={label} className={cx(styles.row, className)}>
      <Key aria-hidden="true">{t('ui.tabs.previousKey')}</Key>
      {/* biome-ignore lint/a11y/noRedundantRoles: Safari y VoiceOver quitan la semántica de lista con list-style: none */}
      <ul role="list" className={styles.list} onKeyDown={roving.onKeyDown} onBlur={onBlur}>
        {links.map((link, index) => (
          <li key={link.to}>
            <NavLink {...roving.getItemBaseProps(index)} to={link.to} className={styles.tab} end>
              <Cursor shape="slant" slant="sm" />
              {link.label}
            </NavLink>
          </li>
        ))}
      </ul>
      <Key aria-hidden="true">{t('ui.tabs.nextKey')}</Key>
    </nav>
  )
}
