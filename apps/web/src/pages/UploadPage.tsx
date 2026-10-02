import { t } from '../i18n'
import { PlaceholderPage } from './PlaceholderPage'

/** `/subir` — subir o editar mi entrada (§3.8.5); solo cuentas verificadas — provisional (0.10). */
export function UploadPage() {
  return <PlaceholderPage title={t('pages.upload.title')} summary={t('pages.upload.summary')} />
}
