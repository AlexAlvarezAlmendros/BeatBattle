import type { ComponentType } from 'react'
import { data, type LoaderFunctionArgs, type RouteObject, redirect } from 'react-router'
import { devRoutes as defaultDevRoutes } from './devRoutes'
import { RootLayout } from './layout/RootLayout'
import { interiorScreen, MENU_SCREEN, type ScreenConfig, simpleScreen } from './layout/screen'
import { FIRST_SETTINGS_SECTION, isLegalDoc, paths } from './paths'
import { RouteErrorBoundary } from './RouteErrorBoundary'

/**
 * Mapa de rutas de la app (guía §2.18). Cada página se carga en diferido en su propio trozo
 * (`lazy`, §4.7.1) y fija su título con `<DocumentTitle>`.
 *
 * - `handle.access` recoge la columna «Acceso» de §2.18; las guardas llegan con las cuentas (Fase 2).
 * - `handle.screen` es la configuración del marco de juego de esa pantalla (§3.4.1, §3.8.14; tarea
 *   0.23): cuña de la arena, teclas de la barra de controles y placa de título del HUD.
 */

export type RouteAccess = 'public' | 'session' | 'verified' | 'admin'
export interface RouteHandle {
  access: RouteAccess
  screen: ScreenConfig
}

const handle = (level: RouteAccess, screen: ScreenConfig): RouteHandle => ({ access: level, screen })

/** Pantalla interior con su placa: rótulo de `frame.plates.<clave>` y título de la página. */
const interior = (
  plate: keyof typeof PLATE_KICKERS,
  title: Parameters<typeof interiorScreen>[0]['title'],
  keys?: Parameters<typeof interiorScreen>[1],
) => interiorScreen({ kicker: PLATE_KICKERS[plate], title }, keys)

/** Rótulos de las placas de título del HUD (§3.8.14: cada pantalla interior con su aspecto de juego). */
const PLATE_KICKERS = {
  week: 'frame.plates.week',
  weekResults: 'frame.plates.weekResults',
  weeks: 'frame.plates.weeks',
  entry: 'frame.plates.entry',
  jury: 'frame.plates.jury',
  upload: 'frame.plates.upload',
  profile: 'frame.plates.profile',
  hallOfFame: 'frame.plates.hallOfFame',
  season: 'frame.plates.season',
  howItWorks: 'frame.plates.howItWorks',
  settings: 'frame.plates.settings',
  signIn: 'frame.plates.signIn',
  signUp: 'frame.plates.signUp',
  account: 'frame.plates.account',
  emails: 'frame.plates.emails',
  admin: 'frame.plates.admin',
  legal: 'frame.plates.legal',
  notFound: 'frame.plates.notFound',
} as const

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
const accountSettings = () => import('../features/settings/AccountSettings')
const emailSettings = () => import('../features/settings/EmailSettings')
const sessionsSettings = () => import('../features/settings/SessionsSettings')
const profileSettings = () => import('../features/settings/ProfileSettings')
const privacySettings = () => import('../features/settings/PrivacySettings')
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
              handle: handle('public', MENU_SCREEN),
              lazy: page(
                () => import('../features/week/HomePage'),
                (m) => m.HomePage,
              ),
            },
            {
              path: 'semana/:slug',
              handle: handle('public', interior('week', 'pages.week.title')),
              lazy: page(
                () => import('../features/week/WeekPage'),
                (m) => m.WeekPage,
              ),
            },
            {
              path: 'semana/:slug/resultados',
              handle: handle('public', interior('weekResults', 'pages.weekResults.title')),
              lazy: page(
                () => import('../features/results/WeekResultsPage'),
                (m) => m.WeekResultsPage,
              ),
            },
            {
              path: 'semanas',
              handle: handle('public', interior('weeks', 'pages.weeks.title')),
              lazy: page(
                () => import('../features/archive/WeeksPage'),
                (m) => m.WeeksPage,
              ),
            },
            {
              path: 'e/:id',
              handle: handle('public', interior('entry', 'pages.entry.title')),
              lazy: page(
                () => import('../features/entries/EntryPage'),
                (m) => m.EntryPage,
              ),
            },
            {
              path: 'jurado',
              handle: handle('verified', interior('jury', 'pages.jury.title')),
              lazy: page(
                () => import('../features/jury/JuryPage'),
                (m) => m.JuryPage,
              ),
            },
            {
              path: 'subir',
              handle: handle('verified', interior('upload', 'pages.upload.title')),
              lazy: page(
                () => import('../features/upload/UploadPage'),
                (m) => m.UploadPage,
              ),
            },
            {
              path: 'p/:username',
              handle: handle('public', interior('profile', 'pages.profile.title')),
              lazy: async () => {
                const m = await import('../features/profile/ProfilePage')
                return { Component: m.ProfilePage, loader: m.profileLoader }
              },
            },
            {
              path: 'salon-de-la-fama',
              handle: handle('public', interior('hallOfFame', 'pages.hallOfFame.title')),
              lazy: page(
                () => import('../features/archive/HallOfFamePage'),
                (m) => m.HallOfFamePage,
              ),
            },
            {
              path: 'temporada/:id',
              handle: handle('public', interior('season', 'pages.season.title')),
              lazy: page(
                () => import('../features/game/SeasonPage'),
                (m) => m.SeasonPage,
              ),
            },
            {
              path: 'como-funciona',
              handle: handle(
                'public',
                interior('howItWorks', 'pages.howItWorks.title', ['choose', 'enter', 'back', 'sound']),
              ),
              lazy: page(
                () => import('../features/week/HowItWorksPage'),
                (m) => m.HowItWorksPage,
              ),
            },
            {
              path: 'ajustes',
              handle: handle('session', interior('settings', 'settings.title', ['section', 'back', 'sound'])),
              lazy: page(
                () => import('../features/settings/SettingsLayout'),
                (m) => m.SettingsLayout,
              ),
              children: [
                // Redirige antes de pintar; el Component vacío evita el aviso de ruta hoja sin elemento.
                {
                  index: true,
                  loader: () => redirect(paths.settings(FIRST_SETTINGS_SECTION)),
                  Component: Redirecting,
                },
                { path: 'sonido', lazy: page(settings, (m) => m.SoundSettingsPage) },
                { path: 'movimiento', lazy: page(settings, (m) => m.MotionSettingsPage) },
                { path: 'cuenta', lazy: page(accountSettings, (m) => m.AccountSettingsPage) },
                { path: 'perfil', lazy: page(profileSettings, (m) => m.ProfileSettingsPage) },
                { path: 'emails', lazy: page(emailSettings, (m) => m.EmailSettingsPage) },
                { path: 'sesiones', lazy: page(sessionsSettings, (m) => m.SessionsSettingsPage) },
                { path: 'privacidad', lazy: page(privacySettings, (m) => m.PrivacySettingsPage) },
                { path: 'accesibilidad', lazy: page(settings, (m) => m.AccessibilitySettingsPage) },
              ],
            },
            {
              path: 'entrar',
              handle: handle(
                'public',
                simpleScreen({ kicker: PLATE_KICKERS.signIn, title: 'pages.signIn.title' }),
              ),
              lazy: page(auth, (m) => m.SignInPage),
            },
            {
              path: 'registro',
              handle: handle(
                'public',
                simpleScreen({ kicker: PLATE_KICKERS.signUp, title: 'pages.signUp.title' }),
              ),
              lazy: page(auth, (m) => m.SignUpPage),
            },
            {
              path: 'verificar',
              handle: handle(
                'public',
                simpleScreen({ kicker: PLATE_KICKERS.account, title: 'pages.verify.title' }),
              ),
              lazy: page(auth, (m) => m.VerifyPage),
            },
            {
              path: 'recuperar',
              handle: handle(
                'public',
                simpleScreen({ kicker: PLATE_KICKERS.account, title: 'pages.recover.title' }),
              ),
              lazy: page(auth, (m) => m.RecoverPage),
            },
            {
              path: 'bienvenida',
              handle: handle(
                'session',
                simpleScreen({ kicker: PLATE_KICKERS.signUp, title: 'account.welcome.title' }),
              ),
              lazy: page(
                () => import('../features/account/WelcomePage'),
                (m) => m.WelcomePage,
              ),
            },
            {
              path: 'baja',
              handle: handle(
                'public',
                simpleScreen({ kicker: PLATE_KICKERS.emails, title: 'pages.unsubscribe.title' }),
              ),
              lazy: page(
                () => import('../features/email/UnsubscribePage'),
                (m) => m.UnsubscribePage,
              ),
            },
            {
              path: 'alerta',
              handle: handle(
                'public',
                simpleScreen({ kicker: PLATE_KICKERS.emails, title: 'pages.alert.title' }),
              ),
              lazy: page(
                () => import('../features/email/AlertConfirmPage'),
                (m) => m.AlertConfirmPage,
              ),
            },
            {
              path: 'admin',
              handle: handle(
                'admin',
                simpleScreen({ kicker: PLATE_KICKERS.admin, title: 'pages.admin.title' }),
              ),
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
              handle: handle(
                'public',
                simpleScreen({ kicker: PLATE_KICKERS.legal, title: 'frame.plates.legalTitle' }, [
                  'section',
                  'back',
                  'sound',
                ]),
              ),
              loader: legalLoader,
              lazy: page(
                () => import('./LegalPage'),
                (m) => m.LegalPage,
              ),
            },
            ...devRoutes,
            {
              path: '*',
              handle: handle('public', interior('notFound', 'pages.notFound.plate')),
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
