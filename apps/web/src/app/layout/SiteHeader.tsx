import { NavLink } from 'react-router'
import { t } from '../../i18n'
import { GlassSurface } from '../../ui/GlassSurface'
import { MobileNavPanel, MobileNavToggle, useMobileNav } from './MobileNav'
import { NAV_ITEMS, SIGN_IN_ITEM } from './navigation'
import { OtpLogo } from './OtpLogo'
import './SiteHeader.css'

/**
 * Isla de navegación del sello (guía §3.1, `Header.css` y `otp-metrics.json`): flotante y `sticky`,
 * de `min(1320px, 100% − 2rem)`, radio 20, separada 16 px del borde, con la sombra `float` y el alto
 * por tramos de `--nav-h`.
 *
 * - Cristal: `GlassSurface` (`--bb-glass-card` + desplazamiento SVG + `blur(3px)`); sin capacidad,
 *   `--bb-glass` + `blur(8px)` (`SiteHeader.css`).
 * - Logo *OTP.* arriba a la izquierda, girado −10°, enlazado a `otherpeople.es` (`RF-OTP-01`); en
 *   móvil, centrado como en el sello.
 * - Enlaces centrados; el activo con `--bb-fill-active` y `aria-current="page"` (lo pone `NavLink`).
 * - A la derecha, el hueco del HUD (`data-slot="hud"`, Fase 7) y «Entrar» en contorno.
 * - ≤ 992 px: los enlaces y «Entrar» pasan al menú móvil (`MobileNav`).
 */
export function SiteHeader() {
  const nav = useMobileNav()

  return (
    <>
      <GlassSurface as="header" className="site-header" backdropBlur="var(--bb-glass-blur-card)">
        {/* Fuera del contenido para posicionarse respecto a la isla (como el `position: fixed` del sello,
            que el `backdrop-filter` de la isla convierte en relativo a ella). */}
        <OtpLogo className="site-header__logo" />
        <div className="site-header__content">
          <nav aria-label={t('layout.nav.label')} className="site-nav">
            {/* biome-ignore lint/a11y/noRedundantRoles: Safari y VoiceOver quitan la semántica de lista con list-style: none */}
            <ul role="list" className="site-nav__links">
              {NAV_ITEMS.map(({ to, label }) => (
                <li key={to}>
                  <NavLink to={to} end={to === '/'} className="site-nav__link">
                    {t(label)}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="site-header__actions">
            <div className="site-header__hud" data-slot="hud" />
            <NavLink to={SIGN_IN_ITEM.to} className="site-header__signin">
              {t(SIGN_IN_ITEM.label)}
            </NavLink>
          </div>
          <MobileNavToggle nav={nav} />
        </div>
      </GlassSurface>
      <MobileNavPanel nav={nav} />
    </>
  )
}
