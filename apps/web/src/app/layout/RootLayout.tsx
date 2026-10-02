import { type MouseEvent, useEffect, useRef } from 'react'
import { Outlet, ScrollRestoration, useLocation, useNavigation } from 'react-router'
import { t } from '../../i18n'
// Directo, sin el índice de `ui/Toast`: el marco solo necesita la zona (las regiones vivas); la pieza y
// Motion llegan en diferido con la parte animada.
import { ToastViewport } from '../../ui/Toast/ToastViewport'
import { AmbientOrbs } from './AmbientOrbs'
import { SiteFooter } from './SiteFooter'
import { SiteHeader } from './SiteHeader'
import './layout.css'

/** Id del contenido principal: destino del enlace «Saltar al contenido». */
export const MAIN_ID = 'contenido'

/**
 * Marco de todas las páginas, con el layout del sello (tarea 0.7, guía §3.1): fondo de orbes rojos,
 * «Saltar al contenido», isla de navegación con el logo *OTP.*, `<main id="contenido">` y pie del sello.
 *
 * - Vuelta arriba al navegar (y posición recuperada al volver atrás) con `ScrollRestoration`.
 * - Al cambiar de página, el foco pasa al `<main>` para que teclado y lector de pantalla empiecen
 *   por el contenido nuevo y no por donde estaba el enlace pulsado (§2.17). Lleva `data-focus-target`
 *   para que `global.css` no le pinte el anillo de foco: es un destino, no un control.
 * - `aria-busy` mientras se carga el trozo diferido de la página siguiente.
 * - La zona de avisos (`ToastViewport`), una sola para toda la app: sus regiones vivas existen desde
 *   la primera pintura y la parte animada se pide cuando el navegador queda libre (§3.3, §4.17).
 */
export function RootLayout() {
  const mainRef = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  const navigation = useNavigation()
  const previousPathname = useRef(pathname)

  useEffect(() => {
    if (previousPathname.current === pathname) return
    previousPathname.current = pathname
    mainRef.current?.focus({ preventScroll: true })
  }, [pathname])

  const skipToContent = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    mainRef.current?.focus()
  }

  return (
    <>
      <AmbientOrbs />
      <a className="skip-link" href={`#${MAIN_ID}`} onClick={skipToContent}>
        {t('app.skipToContent')}
      </a>
      <SiteHeader />
      <main
        id={MAIN_ID}
        ref={mainRef}
        tabIndex={-1}
        data-focus-target
        className="site-main"
        aria-busy={navigation.state === 'loading'}
      >
        <Outlet />
      </main>
      <SiteFooter />
      <ToastViewport />
      <ScrollRestoration />
    </>
  )
}
