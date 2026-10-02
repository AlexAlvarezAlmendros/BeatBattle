import { duration, ease, reducedDuration } from '@beatbattle/shared/tokens'
import { AnimatePresence, domAnimation, LazyMotion, m, type Transition } from 'motion/react'
import { type KeyboardEvent, type RefObject, useCallback, useEffect, useId, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router'
import { t } from '../../i18n'
import { useReducedMotion } from '../../ui/glass'
import { ExternalLink } from './ExternalLink'
import { ChevronIcon, CloseIcon, SocialIcon } from './icons'
import { NAV_ITEMS, OTHER_PEOPLE_SOCIAL, SIGN_IN_ITEM } from './navigation'
import { OTP_LOGO_SRC } from './OtpLogo'
import './MobileNav.css'

/** Por encima de este ancho la isla enseña sus enlaces y el menú móvil no existe (Header.css). */
export const DESKTOP_QUERY = '(min-width: 993px)'

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'

export interface MobileNavState {
  open: boolean
  toggle: () => void
  /** Cierra el panel; con `restoreFocus`, el foco vuelve al botón que lo abrió. */
  close: (options?: { restoreFocus?: boolean }) => void
  toggleRef: RefObject<HTMLButtonElement | null>
  /** Panel del menú: mientras está abierto, todo lo que no es él ni su fondo queda `inert`. */
  panelRef: RefObject<HTMLDivElement | null>
  panelId: string
}

/** Marca de las capas del menú (panel y fondo), que no se vuelven `inert` al abrirlo. */
const LAYER_ATTRIBUTE = 'data-mobile-nav-layer'

/**
 * Deja `inert` a los hermanos del panel (fondo de orbes, «Saltar al contenido», isla, `<main>`, pie):
 * así ni el lector de pantalla al deslizar ni un foco movido por código llegan detrás del diálogo.
 * Devuelve los que ha tocado, para devolverlos a su estado al cerrar.
 */
function makeBackgroundInert(panel: HTMLElement | null): Element[] {
  const siblings = panel?.parentElement ? [...panel.parentElement.children] : []
  const touched = siblings.filter(
    (element) => !element.hasAttribute(LAYER_ATTRIBUTE) && !element.hasAttribute('inert'),
  )
  for (const element of touched) element.setAttribute('inert', '')
  return touched
}

/**
 * Estado del menú móvil (portado de `useMobileNav` del sello). Con el panel abierto: bloquea el scroll
 * de la página, deja `inert` lo de detrás y lo cierra con Esc. Se cierra también al pasar a escritorio
 * y al cambiar de ruta (Atrás del navegador o el gesto atrás de Android): ahí no devuelve el foco al
 * botón, porque `RootLayout` ya lo lleva al `<main>` de la página nueva.
 *
 * `close` libera la página (quita `inert` y el bloqueo del scroll) en el acto, sin esperar al render
 * siguiente: un elemento `inert` no acepta el foco, y justo después se mueve (al botón, o al `<main>`
 * desde el efecto de `RootLayout`, que corre después de este porque es su padre).
 */
export function useMobileNav(): MobileNavState {
  const [open, setOpen] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const releaseRef = useRef<(() => void) | null>(null)
  const panelId = `mobile-nav-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const { pathname } = useLocation()
  const previousPathname = useRef(pathname)

  const close = useCallback((options: { restoreFocus?: boolean } = {}) => {
    releaseRef.current?.()
    setOpen(false)
    if (options.restoreFocus) toggleRef.current?.focus()
  }, [])
  const toggle = useCallback(() => setOpen((value) => !value), [])

  useEffect(() => {
    if (previousPathname.current === pathname) return
    previousPathname.current = pathname
    close()
  }, [pathname, close])

  useEffect(() => {
    if (!open) return
    const { body } = document
    const previousOverflow = body.style.overflow
    body.style.overflow = 'hidden'
    const background = makeBackgroundInert(panelRef.current)
    let released = false
    const release = () => {
      if (released) return
      released = true
      body.style.overflow = previousOverflow
      for (const element of background) element.removeAttribute('inert')
    }
    releaseRef.current = release
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close({ restoreFocus: true })
      }
    }
    document.addEventListener('keydown', onKeyDown)
    const desktop = typeof window.matchMedia === 'function' ? window.matchMedia(DESKTOP_QUERY) : undefined
    const onDesktop = () => {
      if (desktop?.matches) close()
    }
    desktop?.addEventListener('change', onDesktop)
    return () => {
      release()
      releaseRef.current = null
      document.removeEventListener('keydown', onKeyDown)
      desktop?.removeEventListener('change', onDesktop)
    }
  }, [open, close])

  return { open, toggle, close, toggleRef, panelRef, panelId }
}

/** Botón hamburguesa de la isla (≤ 992 px): tres líneas que se cruzan en aspa al abrir. */
export function MobileNavToggle({ nav }: { nav: MobileNavState }) {
  return (
    <button
      ref={nav.toggleRef}
      type="button"
      className="mobile-nav-toggle"
      aria-label={t('layout.mobileNav.toggle')}
      aria-expanded={nav.open}
      aria-controls={nav.panelId}
      data-open={nav.open || undefined}
      onClick={nav.toggle}
    >
      <span className="mobile-nav-toggle__line" />
      <span className="mobile-nav-toggle__line" />
      <span className="mobile-nav-toggle__line" />
    </button>
  )
}

/** Recorre con Tab solo lo enfocable del panel (diálogo modal, §2.17). */
function trapFocus(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== 'Tab') return
  const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)]
  const first = focusable[0]
  const last = focusable.at(-1)
  if (!first || !last) return
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

/**
 * Panel del menú móvil, como el del sello (`MobileNavPanel`): entra desde la derecha sobre un fondo
 * oscurecido, con filete rojo arriba, enlaces grandes, redes del sello y «Entrar». Es un diálogo modal:
 * el foco entra al abrir, Tab no sale de él y Esc lo cierra. Se pinta fuera de la isla, porque el
 * `backdrop-filter` de la isla haría de bloque contenedor de su `position: fixed`.
 *
 * Con «reducir movimiento», el panel y el fondo solo aparecen con un fundido.
 */
export function MobileNavPanel({ nav }: { nav: MobileNavState }) {
  const reduced = useReducedMotion()
  const { pathname } = useLocation()
  const titleId = `${nav.panelId}-title`
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (nav.open) closeRef.current?.focus()
  }, [nav.open])

  const fade: Transition = { duration: reducedDuration.fast / 1000, ease: ease.out }
  const slide: Transition = { duration: duration.base / 1000, ease: ease.out }
  // Si el enlace es la página actual no hay navegación que mueva el foco: vuelve al botón.
  const onNavigate = (to: string) => () => nav.close({ restoreFocus: to === pathname })

  return (
    <LazyMotion features={domAnimation}>
      <AnimatePresence>
        {nav.open && (
          <m.div
            key="overlay"
            className="mobile-nav__overlay"
            aria-hidden="true"
            data-mobile-nav-layer=""
            onClick={() => nav.close({ restoreFocus: true })}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduced ? fade : slide}
          />
        )}
        {nav.open && (
          <m.div
            key="panel"
            ref={nav.panelRef}
            id={nav.panelId}
            data-mobile-nav-layer=""
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="mobile-nav__panel"
            onKeyDown={trapFocus}
            initial={reduced ? { opacity: 0 } : { x: '100%' }}
            animate={reduced ? { opacity: 1 } : { x: 0 }}
            exit={reduced ? { opacity: 0 } : { x: '100%' }}
            transition={reduced ? fade : slide}
          >
            <div className="mobile-nav__accent" aria-hidden="true" />
            <div className="mobile-nav__header">
              <h2 id={titleId} className="sr-only">
                {t('layout.mobileNav.title')}
              </h2>
              <img className="mobile-nav__logo" src={OTP_LOGO_SRC} alt="" width={56} height={36} />
              <button
                ref={closeRef}
                type="button"
                className="mobile-nav__close"
                aria-label={t('layout.mobileNav.close')}
                onClick={() => nav.close({ restoreFocus: true })}
              >
                <CloseIcon className="mobile-nav__close-icon" />
              </button>
            </div>
            <nav aria-label={t('layout.nav.label')} className="mobile-nav__nav">
              {/* biome-ignore lint/a11y/noRedundantRoles: Safari y VoiceOver quitan la semántica de lista con list-style: none */}
              <ul role="list" className="mobile-nav__links">
                {NAV_ITEMS.map(({ to, label }) => (
                  <li key={to}>
                    <NavLink to={to} end={to === '/'} className="mobile-nav__link" onClick={onNavigate(to)}>
                      <span className="mobile-nav__label">{t(label)}</span>
                      <ChevronIcon className="mobile-nav__arrow" />
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="mobile-nav__footer">
              {/* biome-ignore lint/a11y/noRedundantRoles: Safari y VoiceOver quitan la semántica de lista con list-style: none */}
              <ul role="list" className="mobile-nav__social" aria-label={t('layout.footer.socialNav')}>
                {OTHER_PEOPLE_SOCIAL.map(({ network, href, label }) => (
                  <li key={network}>
                    <ExternalLink href={href} className="mobile-nav__social-link">
                      <SocialIcon network={network} className="mobile-nav__social-icon" />
                      <span className="sr-only">{t(label)}</span>
                    </ExternalLink>
                  </li>
                ))}
              </ul>
              <NavLink
                to={SIGN_IN_ITEM.to}
                className="mobile-nav__signin"
                onClick={onNavigate(SIGN_IN_ITEM.to)}
              >
                {t(SIGN_IN_ITEM.label)}
              </NavLink>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </LazyMotion>
  )
}
