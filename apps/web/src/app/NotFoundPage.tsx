import { Link } from 'react-router'
import { t } from '../i18n'
import { PlaceholderPage } from './PlaceholderPage'
import { paths } from './paths'

/**
 * `*` — 404 provisional. En la Fase 8 será el beat pad (§3.8.11). También la pinta el límite de
 * errores de las rutas cuando un loader responde 404 (p. ej. `/legal/:doc` con un documento que no
 * existe).
 */
export function NotFoundPage() {
  return (
    <PlaceholderPage title={t('pages.notFound.title')} summary={t('pages.notFound.summary')}>
      <p>
        <Link to={paths.home()}>{t('common.backHome')}</Link>
      </p>
    </PlaceholderPage>
  )
}
