import { useParams } from 'react-router'
import { PlaceholderPage } from '../../app/PlaceholderPage'
import { t } from '../../i18n'

/** `/p/:username` — perfil público y carta (§3.8.10) — provisional (0.10). */
export function ProfilePage() {
  const { username = '' } = useParams()
  return (
    <PlaceholderPage title={t('pages.profile.title')} summary={t('pages.profile.summary', { username })} />
  )
}
