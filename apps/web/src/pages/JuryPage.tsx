import { t } from '../i18n'
import { PlaceholderPage } from './PlaceholderPage'

/** `/jurado` — Modo Jurado (§3.8.7); solo cuentas verificadas — provisional (0.10). */
export function JuryPage() {
  return <PlaceholderPage title={t('pages.jury.title')} summary={t('pages.jury.summary')} />
}
