import { useParams } from 'react-router'
import { t } from '../i18n'
import { PlaceholderPage } from './PlaceholderPage'

/** `/p/:username` — perfil público y carta (§3.8.10) — provisional (0.10). */
export function ProfilePage() {
  const { username = '' } = useParams()
  return (
    <PlaceholderPage title={t('pages.profile.title')} summary={t('pages.profile.summary', { username })} />
  )
}
