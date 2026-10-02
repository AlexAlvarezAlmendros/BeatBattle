import { type MouseEvent, useEffect, useRef } from 'react'
import { Outlet, ScrollRestoration, useLocation, useNavigation } from 'react-router'
import { t } from '../../i18n'
import { SiteFooter } from './SiteFooter'
import { SiteHeader } from './SiteHeader'
import './layout.css'

/** Id del contenido principal: destino del enlace «Saltar al contenido». */
export const MAIN_ID = 'contenido'

/**
 * Marco de todas las páginas: «Saltar al contenido», cabecera, `<main id="contenido">` y pie.
 *
 * - Vuelta arriba al navegar (y posición recuperada al volver atrás) con `ScrollRestoration`.
 * - Al cambiar de página, el foco pasa al `<main>` para que teclado y lector de pantalla empiecen
 *   por el contenido nuevo y no por donde estaba el enlace pulsado (§2.17).
 * - `aria-busy` mientras se carga el trozo diferido de la página siguiente.
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
      <a className="skip-link" href={`#${MAIN_ID}`} onClick={skipToContent}>
        {t('app.skipToContent')}
      </a>
      <SiteHeader />
      <main
        id={MAIN_ID}
        ref={mainRef}
        tabIndex={-1}
        className="site-main"
        aria-busy={navigation.state === 'loading'}
      >
        <Outlet />
      </main>
      <SiteFooter />
      <ScrollRestoration />
    </>
  )
}
