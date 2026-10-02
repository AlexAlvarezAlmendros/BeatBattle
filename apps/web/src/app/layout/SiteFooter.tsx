import { Link } from 'react-router'
import { t } from '../../i18n'
import { LEGAL_DOCS, OTHER_PEOPLE_URL, paths } from '../paths'

/**
 * Pie del sitio. De momento solo estructura semántica: la tarea 0.7 lo convierte en el pie compartido
 * con el sello (`RF-OTP-01`).
 */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>
        {t('app.brand')} · <a href={OTHER_PEOPLE_URL}>{t('footer.otherPeople')}</a>
      </p>
      <p>{t('footer.tagline')}</p>
      <nav aria-label={t('footer.legalLabel')}>
        {/* biome-ignore lint/a11y/noRedundantRoles: Safari y VoiceOver quitan la semántica de lista con list-style: none */}
        <ul role="list" className="site-footer__links">
          {LEGAL_DOCS.map((doc) => (
            <li key={doc}>
              <Link to={paths.legal(doc)}>{t(`legal.docs.${doc}`)}</Link>
            </li>
          ))}
        </ul>
      </nav>
    </footer>
  )
}
