import { Link, NavLink } from 'react-router'
import { type SimpleMessageKey, t } from '../../i18n'
import { paths } from '../paths'

/** Enlaces de la navegación principal. */
const NAV_ITEMS: readonly { to: string; label: SimpleMessageKey }[] = [
  { to: paths.home(), label: 'nav.home' },
  { to: paths.weeks(), label: 'nav.weeks' },
  { to: paths.hallOfFame(), label: 'nav.hallOfFame' },
  { to: paths.howItWorks(), label: 'nav.howItWorks' },
  { to: paths.signIn(), label: 'nav.signIn' },
]

/**
 * Cabecera del sitio. De momento solo estructura semántica: la tarea 0.7 la convierte en la isla
 * flotante del sello (medidas de `Header.css`, logo *OTP.* a −10°) y la 7.x le añade el HUD.
 */
export function SiteHeader() {
  return (
    <header className="site-header">
      <Link to={paths.home()} className="site-header__brand">
        {t('app.name')}
      </Link>
      <nav aria-label={t('nav.label')}>
        {/* biome-ignore lint/a11y/noRedundantRoles: Safari y VoiceOver quitan la semántica de lista con list-style: none */}
        <ul role="list" className="site-header__links">
          {NAV_ITEMS.map(({ to, label }) => (
            <li key={to}>
              <NavLink to={to} end={to === paths.home()}>
                {t(label)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  )
}
