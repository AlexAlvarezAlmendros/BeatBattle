import { lazy, Suspense } from 'react'
import { isRouteErrorResponse, useRouteError } from 'react-router'
import { t } from '../i18n'
import styles from './RouteErrorBoundary.module.css'
import { ScreenPage } from './ScreenPage'

const NotFoundPage = lazy(() => import('./NotFoundPage').then((m) => ({ default: m.NotFoundPage })))

/**
 * Límite de errores de las pantallas: se pinta dentro del marco (el HUD y la barra siguen ahí).
 * - Un 404 lanzado por un loader (`throw data(null, { status: 404 })`) pinta la 404.
 * - Cualquier otro error, la pantalla de error de §2.19 («Se ha rayado el disco»), con «Volver al menú»
 *   como primer elemento de juego (`backIsStart`, §3.8.14).
 *   En desarrollo, además, el mensaje del error.
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
    <ScreenPage title={t('pages.error.title')} summary={t('pages.error.summary')} backIsStart>
      {import.meta.env.DEV && <pre className={styles.detail}>{describeError(error)}</pre>}
    </ScreenPage>
  )
}

function describeError(error: unknown): string {
  if (isRouteErrorResponse(error)) return `${error.status} ${error.statusText}`
  if (error instanceof Error) return error.stack ?? error.message
  return String(error)
}
