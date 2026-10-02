import { useParams } from 'react-router'
import { t } from '../i18n'
import { PlaceholderPage } from './PlaceholderPage'

/** `/e/:id` — ficha de entrada — provisional (0.10). */
export function EntryPage() {
  const { id = '' } = useParams()
  return <PlaceholderPage title={t('pages.entry.title')} summary={t('pages.entry.summary', { id })} />
}
