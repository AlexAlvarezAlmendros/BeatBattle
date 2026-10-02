import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, matchRoutes, type RouteObject, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type SimpleMessageKey, t } from '../i18n'
import { documentTitle } from './DocumentTitle'
import { LEGAL_DOCS, paths } from './paths'
import { type RouteAccess, type RouteHandle, routes } from './routes'

function renderAt(path: string, routeList: RouteObject[] = routes) {
  const router = createMemoryRouter(routeList, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

const h1 = (name: string) => screen.findByRole('heading', { level: 1, name })
/** Traduce una clave compuesta en el test; en modo estricto, una clave que no existe es un error. */
const tk = (key: string) => {
  if (!t.has(key)) throw new Error(`Falta la clave «${key}» en es.json`)
  return t(key as SimpleMessageKey)
}

/** Rutas de §2.18 → clave del `<h1>` y título esperado de la pestaña. */
const PAGES: { path: string; heading: string; title: string }[] = [
  { path: '/', heading: 'pages.home.title', title: documentTitle() },
  { path: '/semana/2026-41', heading: 'pages.week.title', title: documentTitle(tk('pages.week.title')) },
  {
    path: '/semana/2026-41/resultados',
    heading: 'pages.weekResults.title',
    title: documentTitle(tk('pages.weekResults.title')),
  },
  { path: '/semanas', heading: 'pages.weeks.title', title: documentTitle(tk('pages.weeks.title')) },
  { path: '/e/0192f3a1', heading: 'pages.entry.title', title: documentTitle(tk('pages.entry.title')) },
  { path: '/jurado', heading: 'pages.jury.title', title: documentTitle(tk('pages.jury.title')) },
  { path: '/subir', heading: 'pages.upload.title', title: documentTitle(tk('pages.upload.title')) },
  { path: '/p/aina', heading: 'pages.profile.title', title: documentTitle(tk('pages.profile.title')) },
  {
    path: '/salon-de-la-fama',
    heading: 'pages.hallOfFame.title',
    title: documentTitle(tk('pages.hallOfFame.title')),
  },
  { path: '/temporada/t4', heading: 'pages.season.title', title: documentTitle(tk('pages.season.title')) },
  {
    path: '/como-funciona',
    heading: 'pages.howItWorks.title',
    title: documentTitle(tk('pages.howItWorks.title')),
  },
  ...(['account', 'profile', 'sound', 'emails', 'sessions', 'privacy'] as const).map((section, i) => ({
    path: `/ajustes/${['cuenta', 'perfil', 'sonido', 'emails', 'sesiones', 'privacidad'][i]}`,
    heading: `settings.${section}.title`,
    title: documentTitle(`${tk(`settings.${section}.title`)} · ${t('settings.title')}`),
  })),
  { path: '/entrar', heading: 'pages.signIn.title', title: documentTitle(tk('pages.signIn.title')) },
  { path: '/registro', heading: 'pages.signUp.title', title: documentTitle(tk('pages.signUp.title')) },
  { path: '/verificar', heading: 'pages.verify.title', title: documentTitle(tk('pages.verify.title')) },
  { path: '/recuperar', heading: 'pages.recover.title', title: documentTitle(tk('pages.recover.title')) },
  { path: '/admin', heading: 'pages.admin.title', title: documentTitle(tk('pages.admin.title')) },
  ...LEGAL_DOCS.map((doc) => ({
    path: `/legal/${doc}`,
    heading: `legal.docs.${doc}`,
    title: documentTitle(t(`legal.docs.${doc}`)),
  })),
  { path: '/dev/galeria', heading: 'dev.gallery.title', title: documentTitle(tk('dev.gallery.title')) },
]

describe('router (0.10, guía §2.18)', () => {
  beforeEach(() => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it.each(PAGES)('$path pinta su <h1> y su título', async ({ path, heading, title }) => {
    renderAt(path)
    expect(await h1(tk(heading))).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    await waitFor(() => expect(document.title).toBe(title))
  })

  it('las páginas con parámetros los reciben', async () => {
    renderAt('/semana/2026-41')
    expect(await screen.findByText(/«2026-41»/)).toBeInTheDocument()
  })

  it('todas las páginas están dentro del marco: saltar al contenido, cabecera, <main id="contenido"> y pie', async () => {
    renderAt('/semanas')
    await h1(t('pages.weeks.title'))
    const skip = screen.getByRole('link', { name: t('app.skipToContent') })
    expect(skip).toHaveAttribute('href', '#contenido')
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveAttribute('id', 'contenido')
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: t('nav.label') })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: t('nav.weeks') })).toHaveAttribute('aria-current', 'page')
  })

  it('«Saltar al contenido» lleva el foco al <main>', async () => {
    const user = userEvent.setup()
    renderAt('/')
    await h1(t('pages.home.title'))
    await user.tab()
    const skip = screen.getByRole('link', { name: t('app.skipToContent') })
    expect(skip).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('main')).toHaveFocus()
  })

  it.each(['/no-existe', '/semana', '/semana/2026-41/otra', '/ajustes/nada', '/admin/nada', '/legal/nada'])(
    '%s → 404 dentro del marco',
    async (path) => {
      renderAt(path)
      expect(await h1(t('pages.notFound.title'))).toBeInTheDocument()
      expect(screen.getByRole('banner')).toBeInTheDocument()
      await waitFor(() => expect(document.title).toBe(documentTitle(t('pages.notFound.title'))))
    },
  )

  it('/ajustes lleva a /ajustes/cuenta', async () => {
    const router = renderAt('/ajustes')
    expect(await h1(t('settings.account.title'))).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/ajustes/cuenta')
  })

  it('al navegar vuelve arriba y el foco pasa al contenido nuevo', async () => {
    const user = userEvent.setup()
    renderAt('/')
    await h1(t('pages.home.title'))
    const scrollTo = vi.mocked(window.scrollTo)
    scrollTo.mockClear()
    await user.click(screen.getByRole('link', { name: t('nav.howItWorks') }))
    expect(await h1(t('pages.howItWorks.title'))).toBeInTheDocument()
    expect(scrollTo).toHaveBeenCalledWith(0, 0)
    expect(screen.getByRole('main')).toHaveFocus()
  })

  it('cada página se carga en diferido (lazy) y no en el trozo principal', () => {
    const leaves: RouteObject[] = []
    const walk = (list: RouteObject[]) => {
      for (const route of list) {
        if (route.children) walk(route.children)
        else if (!(route.index && route.loader && !route.lazy)) leaves.push(route)
      }
    }
    walk(routes)
    expect(leaves.length).toBeGreaterThan(20)
    for (const route of leaves) {
      expect(route.lazy, route.path ?? 'index').toBeTypeOf('function')
      expect(route.Component, route.path ?? 'index').toBeUndefined()
    }
  })

  it('el acceso de cada ruta es el de §2.18', () => {
    const expected: Record<string, RouteAccess> = {
      '/': 'public',
      '/semana/x': 'public',
      '/semana/x/resultados': 'public',
      '/semanas': 'public',
      '/e/x': 'public',
      '/jurado': 'verified',
      '/subir': 'verified',
      '/p/x': 'public',
      '/salon-de-la-fama': 'public',
      '/temporada/x': 'public',
      '/como-funciona': 'public',
      '/ajustes/cuenta': 'session',
      '/entrar': 'public',
      '/registro': 'public',
      '/verificar': 'public',
      '/recuperar': 'public',
      '/admin': 'admin',
      '/legal/bases': 'public',
      '/no-existe': 'public',
    }
    for (const [path, level] of Object.entries(expected)) {
      const matches = matchRoutes(routes, path) ?? []
      const handles = matches.map((m) => m.route.handle as RouteHandle | undefined).filter(Boolean)
      expect(handles.at(-1)?.access, path).toBe(level)
    }
  })

  it('los ayudantes de paths resuelven a su ruta y no al 404', () => {
    const urls = [
      paths.home(),
      paths.week('2026-41'),
      paths.weekResults('2026-41'),
      paths.weeks(),
      paths.entry('0192f3a1'),
      paths.jury(),
      paths.upload(),
      paths.profile('aina'),
      paths.hallOfFame(),
      paths.season('t4'),
      paths.howItWorks(),
      paths.settings(),
      paths.settings('privacidad'),
      paths.signIn(),
      paths.signUp(),
      paths.verify(),
      paths.recover(),
      paths.admin(),
      ...LEGAL_DOCS.map((doc) => paths.legal(doc)),
    ]
    for (const url of urls) {
      const last = matchRoutes(routes, url)?.at(-1)?.route
      expect(last?.path, url).not.toBe('*')
    }
  })

  it('la galería existe en desarrollo y no existe en producción', async () => {
    expect(matchRoutes(routes, '/dev/galeria')?.at(-1)?.route.path).toBe('dev/galeria')

    vi.stubEnv('DEV', false)
    vi.stubEnv('PROD', true)
    vi.resetModules()
    const { devRoutes } = await import('./devRoutes')
    expect(devRoutes).toEqual([])
    const production = (await import('./routes')).createRoutes()
    expect(matchRoutes(production, '/dev/galeria')?.at(-1)?.route.path).toBe('*')
    renderAt('/dev/galeria', production)
    expect(await h1(t('pages.notFound.title'))).toBeInTheDocument()
  })
})
