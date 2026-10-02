import type { ComponentType } from 'react'
import { data, type LoaderFunctionArgs, type RouteObject, redirect } from 'react-router'
import { devRoutes as defaultDevRoutes } from './devRoutes'
import { RootLayout } from './layout/RootLayout'
import { isLegalDoc, paths } from './paths'
import { RouteErrorBoundary } from './RouteErrorBoundary'

/**
 * Mapa de rutas de la app (guía §2.18). Cada página se carga en diferido en su propio trozo
 * (`lazy`, §4.7.1) y fija su título con `<DocumentTitle>`.
 *
 * `handle.access` recoge la columna «Acceso» de §2.18; las guardas llegan con las cuentas (Fase 2).
 */

export type RouteAccess = 'public' | 'session' | 'verified' | 'admin'
export interface RouteHandle {
  access: RouteAccess
}

const access = (level: RouteAccess): RouteHandle => ({ access: level })

/** `lazy` de React Router para un componente con nombre de un módulo. */
function page<M>(load: () => Promise<M>, pick: (module: M) => ComponentType) {
  return async () => ({ Component: pick(await load()) })
}

/** 404 desde un loader: lo recoge `RouteErrorBoundary` y pinta la página 404 dentro del marco. */
export function notFound(): never {
  throw data(null, { status: 404, statusText: 'Not Found' })
}

function legalLoader({ params }: LoaderFunctionArgs) {
  if (!isLegalDoc(params.doc)) notFound()
  return null
}

/** Ruta que solo redirige desde su loader: no pinta nada. */
function Redirecting() {
  return null
}

const settings = () => import('../features/settings/SettingsPages')
const auth = () => import('../features/auth/AuthPages')

export interface CreateRoutesOptions {
  /** Rutas solo de desarrollo (la galería). Por defecto, las de `devRoutes.ts`. */
  devRoutes?: RouteObject[]
}

export function createRoutes({ devRoutes = defaultDevRoutes }: CreateRoutesOptions = {}): RouteObject[] {
  return [
    {
      id: 'root',
      Component: RootLayout,
      ErrorBoundary: RouteErrorBoundary,
      // Mientras se resuelve el trozo de la primera página: negro, como el `index.html`.
      HydrateFallback: () => null,
      children: [
        {
          // Límite de errores dentro del marco: cabecera y pie siguen visibles.
          ErrorBoundary: RouteErrorBoundary,
          children: [
            {
              index: true,
              handle: access('public'),
              lazy: page(
                () => import('../features/week/HomePage'),
                (m) => m.HomePage,
              ),
            },
            {
              path: 'semana/:slug',
              handle: access('public'),
              lazy: page(
                () => import('../features/week/WeekPage'),
                (m) => m.WeekPage,
              ),
            },
            {
              path: 'semana/:slug/resultados',
              handle: access('public'),
              lazy: page(
                () => import('../features/results/WeekResultsPage'),
                (m) => m.WeekResultsPage,
              ),
            },
            {
              path: 'semanas',
              handle: access('public'),
              lazy: page(
                () => import('../features/archive/WeeksPage'),
                (m) => m.WeeksPage,
              ),
            },
            {
              path: 'e/:id',
              handle: access('public'),
              lazy: page(
                () => import('../features/entries/EntryPage'),
                (m) => m.EntryPage,
              ),
            },
            {
              path: 'jurado',
              handle: access('verified'),
              lazy: page(
                () => import('../features/jury/JuryPage'),
                (m) => m.JuryPage,
              ),
            },
            {
              path: 'subir',
              handle: access('verified'),
              lazy: page(
                () => import('../features/upload/UploadPage'),
                (m) => m.UploadPage,
              ),
            },
            {
              path: 'p/:username',
              handle: access('public'),
              lazy: page(
                () => import('../features/profile/ProfilePage'),
                (m) => m.ProfilePage,
              ),
            },
            {
              path: 'salon-de-la-fama',
              handle: access('public'),
              lazy: page(
                () => import('../features/archive/HallOfFamePage'),
                (m) => m.HallOfFamePage,
              ),
            },
            {
              path: 'temporada/:id',
              handle: access('public'),
              lazy: page(
                () => import('../features/game/SeasonPage'),
                (m) => m.SeasonPage,
              ),
            },
            {
              path: 'como-funciona',
              handle: access('public'),
              lazy: page(
                () => import('../features/week/HowItWorksPage'),
                (m) => m.HowItWorksPage,
              ),
            },
            {
              path: 'ajustes',
              handle: access('session'),
              lazy: page(
                () => import('../features/settings/SettingsLayout'),
                (m) => m.SettingsLayout,
              ),
              children: [
                // Redirige antes de pintar; el Component vacío evita el aviso de ruta hoja sin elemento.
                { index: true, loader: () => redirect(paths.settings('cuenta')), Component: Redirecting },
                { path: 'cuenta', lazy: page(settings, (m) => m.AccountSettingsPage) },
                { path: 'perfil', lazy: page(settings, (m) => m.ProfileSettingsPage) },
                { path: 'sonido', lazy: page(settings, (m) => m.SoundSettingsPage) },
                { path: 'emails', lazy: page(settings, (m) => m.EmailSettingsPage) },
                { path: 'sesiones', lazy: page(settings, (m) => m.SessionsSettingsPage) },
                { path: 'privacidad', lazy: page(settings, (m) => m.PrivacySettingsPage) },
              ],
            },
            { path: 'entrar', handle: access('public'), lazy: page(auth, (m) => m.SignInPage) },
            { path: 'registro', handle: access('public'), lazy: page(auth, (m) => m.SignUpPage) },
            { path: 'verificar', handle: access('public'), lazy: page(auth, (m) => m.VerifyPage) },
            { path: 'recuperar', handle: access('public'), lazy: page(auth, (m) => m.RecoverPage) },
            {
              path: 'admin',
              handle: access('admin'),
              // Las secciones del panel (samples, semanas, moderación, campañas, uso) se añaden aquí.
              children: [
                {
                  index: true,
                  lazy: page(
                    () => import('../features/admin/AdminPage'),
                    (m) => m.AdminPage,
                  ),
                },
              ],
            },
            {
              path: 'legal/:doc',
              handle: access('public'),
              loader: legalLoader,
              lazy: page(
                () => import('./LegalPage'),
                (m) => m.LegalPage,
              ),
            },
            ...devRoutes,
            {
              path: '*',
              handle: access('public'),
              lazy: page(
                () => import('./NotFoundPage'),
                (m) => m.NotFoundPage,
              ),
            },
          ],
        },
      ],
    },
  ]
}

/** Rutas de la app (con la galería solo en desarrollo). */
export const routes = createRoutes()
