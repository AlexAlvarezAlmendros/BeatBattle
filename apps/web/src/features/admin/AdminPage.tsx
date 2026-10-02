import { PlaceholderPage } from '../../app/PlaceholderPage'
import { t } from '../../i18n'

/** `/admin` — panel de administración (§2.14); solo admins — provisional (0.10). */
export function AdminPage() {
  return <PlaceholderPage title={t('pages.admin.title')} summary={t('pages.admin.summary')} />
}
