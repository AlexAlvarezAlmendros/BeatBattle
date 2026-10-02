import { useParams } from 'react-router'
import { PlaceholderPage } from '../../app/PlaceholderPage'
import { t } from '../../i18n'

/** `/temporada/:id` — clasificación de temporada — provisional (0.10). */
export function SeasonPage() {
  const { id = '' } = useParams()
  return <PlaceholderPage title={t('pages.season.title')} summary={t('pages.season.summary', { id })} />
}
