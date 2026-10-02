import { Link } from 'react-router'
import { PlaceholderPage } from '../../app/PlaceholderPage'
import { paths } from '../../app/paths'
import { t } from '../../i18n'

/** `/como-funciona` — reglas en corto, FAQ y enlace a las bases. Provisional (0.10). */
export function HowItWorksPage() {
  return (
    <PlaceholderPage title={t('pages.howItWorks.title')} summary={t('pages.howItWorks.summary')}>
      <p>
        <Link to={paths.legal('bases')}>{t('legal.docs.bases')}</Link>
      </p>
    </PlaceholderPage>
  )
}
