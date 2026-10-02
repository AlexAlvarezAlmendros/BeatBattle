import { lazy, Suspense } from 'react'
import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { t } from '../i18n'
import { PlaceholderPage } from './PlaceholderPage'
import { paths } from './paths'

const NotFoundPage = lazy(() => import('./NotFoundPage').then((m) => ({ default: m.NotFoundPage })))

/**
 * Límite de errores de las páginas: se pinta dentro del marco (cabecera y pie siguen ahí).
 * - Un 404 lanzado por un loader (`throw data(null, { status: 404 })`) pinta la página 404.
 * - Cualquier otro error, la pantalla de error de §2.19 («Se ha rayado el disco»). En desarrollo,
 *   además, el mensaje del error.
 */
export function RouteErrorBoundary() {
  const error = useRouteError()

  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <Suspense fallback={null}>
        <NotFoundPage />
      </Suspense>
    )
  }

  return (
    <PlaceholderPage title={t('pages.error.title')} summary={t('pages.error.summary')}>
      <p>
        <Link to={paths.home()}>{t('common.backHome')}</Link>
      </p>
      {import.meta.env.DEV && <pre className="route-error__detail">{describeError(error)}</pre>}
    </PlaceholderPage>
  )
}

function describeError(error: unknown): string {
  if (isRouteErrorResponse(error)) return `${error.status} ${error.statusText}`
  if (error instanceof Error) return error.stack ?? error.message
  return String(error)
}
