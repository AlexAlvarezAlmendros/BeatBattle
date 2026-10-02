import { useParams } from 'react-router'
import { PlaceholderPage } from '../../app/PlaceholderPage'
import { t } from '../../i18n'

/** `/e/:id` — ficha de entrada — provisional (0.10). */
export function EntryPage() {
  const { id = '' } = useParams()
  return <PlaceholderPage title={t('pages.entry.title')} summary={t('pages.entry.summary', { id })} />
}
