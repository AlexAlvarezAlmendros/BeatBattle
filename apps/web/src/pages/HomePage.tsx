import { t } from '../i18n'
import { PlaceholderPage } from './PlaceholderPage'

/** `/` — home de la semana en curso (§3.8.3). Provisional (0.10); lleva el título de la marca. */
export function HomePage() {
  return (
    <PlaceholderPage title={t('pages.home.title')} summary={t('pages.home.summary')} documentTitle={null} />
  )
}
