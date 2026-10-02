import { useParams } from 'react-router'
import { t } from '../../i18n'
import { PlaceholderPage } from '../PlaceholderPage'

/** `/semana/:slug` — semana en curso o pasada — provisional (0.10). */
export function WeekPage() {
  const { slug = '' } = useParams()
  return <PlaceholderPage title={t('pages.week.title')} summary={t('pages.week.summary', { slug })} />
}
