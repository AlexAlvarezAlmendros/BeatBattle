import { type MouseEvent, useEffect, useRef } from 'react'
import { Outlet, ScrollRestoration, useLocation, useNavigation, useNavigationType } from 'react-router'
import { t } from '../../i18n'
import { keepsTabFocus } from '../../ui/Tabs'
// Directo, sin el índice de `ui/Toast`: el marco solo necesita la zona (las regiones vivas); la pieza y
// Motion llegan en diferido con la parte animada.
import { ToastViewport } from '../../ui/Toast/ToastViewport'
import { ArenaBackdrop } from './ArenaBackdrop'
import { ControlsBar } from './ControlsBar'
import { Hud } from './Hud'
import { useScreen } from './screen'
import { FrameSlotsProvider } from './slots'
import { useAudioUnlock } from './useAudioUnlock'
import { useFrameKeys } from './useFrameKeys'
import { useGamepad } from './useGamepad'
import './layout.css'

/** Id del contenido principal: destino del enlace «Saltar al contenido». */
export const MAIN_ID = 'contenido'

/**
 * Marco de juego de todas las pantallas (guía §3.4.1, §3.5, §3.6; tarea 0.23): la arena detrás, «Saltar
 * al contenido», el HUD arriba, `<main id="contenido">` y la barra de controles abajo con la firma del
 * sello. Lo que cambia de una pantalla a otra (cuña, teclas, placa de título) sale de su ruta
 * (`handle.screen`, ver `screen.ts`); lo que la pantalla rellena en el HUD, la barra o la arena va por
 * sus huecos (`slots.tsx`).
 *
 * - Teclas globales: Esc vuelve al menú y M enciende o apaga el sonido (`useFrameKeys`); con un mando,
 *   sus botones se traducen a esas mismas teclas (`useGamepad`).
 * - **Transición de pantalla** (§3.6): al navegar, la diagonal barre la pantalla (`--bb-dur-base`) y el
 *   contenido nuevo entra deslizándose desde ella (`--bb-dur-slam`); con «reducir movimiento», solo un
 *   fundido de 150 ms. La primera carga no se anima: el contenido sale con la primera pintura
 *   (`RNF-PERF-02`).
 * - Vuelta arriba al navegar (y posición recuperada al volver atrás o al recargar) con
 *   `ScrollRestoration`. Una carga nueva empieza arriba porque cada entrada del historial tiene su
 *   propia clave, también la primera (`ensureHistoryEntryKey` en `router.tsx`).
 * - Al cambiar de pantalla, el foco pasa al `<main>` para que teclado y lector de pantalla empiecen por
 *   el contenido nuevo (§2.17). Lleva `data-focus-target="main"`: es un destino, no un control, y con
 *   el foco ahí la pantalla está «en reposo» (las flechas e Intro van a su menú, `isIdleFocus`). Salvo
 *   si se cambia de sección con Q/E desde las pestañas (`TabLinks`): entonces el foco se queda en ellas.
 * - `aria-busy` mientras se carga el trozo diferido de la pantalla siguiente.
 * - La zona de avisos (`ToastViewport`), una sola para toda la app (§3.3, §4.17).
 */
export function RootLayout() {
  return (
    <FrameSlotsProvider>
      <GameFrame />
    </FrameSlotsProvider>
  )
}

function GameFrame() {
  const mainRef = useRef<HTMLElement>(null)
  const location = useLocation()
  const { pathname } = location
  const navigationType = useNavigationType()
  const navigation = useNavigation()
  const screen = useScreen()
  const previousPathname = useRef(pathname)
  // ¿Se ha cambiado ya de pantalla? En la primera carga no hay transición. Se decide en el render (no en
  // un efecto) para que la pantalla nueva salga ya con su entrada, sin un fotograma quieta antes.
  const firstPathname = useRef(pathname)
  const navigated = useRef(false)
  if (pathname !== firstPathname.current) navigated.current = true
  useFrameKeys()
  useGamepad()
  useAudioUnlock()

  // biome-ignore lint/correctness/useExhaustiveDependencies: solo al cambiar de pantalla (con el estado de esa navegación)
  useEffect(() => {
    if (previousPathname.current === pathname) return
    previousPathname.current = pathname
    // Q/E desde las pestañas: `TabLinks` ya ha llevado el foco a la de la sección nueva.
    if (keepsTabFocus(location.state, navigationType)) return
    mainRef.current?.focus({ preventScroll: true })
  }, [pathname])

  const skipToContent = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    mainRef.current?.focus()
  }

  return (
    <div className="game-frame" data-wedge={screen.wedge} data-simple={screen.simple || undefined}>
      <ArenaBackdrop wedge={screen.wedge} rays={screen.rays ?? true} />
      <a className="skip-link" href={`#${MAIN_ID}`} onClick={skipToContent}>
        {t('app.skipToContent')}
      </a>
      <Hud screen={screen} />
      <main
        id={MAIN_ID}
        ref={mainRef}
        tabIndex={-1}
        data-focus-target="main"
        className="game-main"
        aria-busy={navigation.state === 'loading'}
      >
        <div key={pathname} className="game-screen" data-entering={navigated.current || undefined}>
          <Outlet />
        </div>
      </main>
      {navigated.current && <span key={pathname} className="screen-sweep" aria-hidden="true" />}
      <ControlsBar screen={screen} />
      <ToastViewport />
      <ScrollRestoration />
    </div>
  )
}
