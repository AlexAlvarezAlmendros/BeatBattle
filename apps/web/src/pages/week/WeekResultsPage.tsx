import { useParams } from 'react-router'
import { t } from '../../i18n'
import { PlaceholderPage } from '../PlaceholderPage'

/** `/semana/:slug/resultados` — resultados y ceremonia (§3.8.6) — provisional (0.10). */
export function WeekResultsPage() {
  const { slug = '' } = useParams()
  return (
    <PlaceholderPage
      title={t('pages.weekResults.title')}
      summary={t('pages.weekResults.summary', { slug })}
    />
  )
}
