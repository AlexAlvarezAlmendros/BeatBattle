import type { ProfileGame } from '@beatbattle/shared'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../i18n'
import { EMPTY_ME_GAME, EMPTY_PROFILE_GAME } from '../../test/game'
import { useSession } from '../account/session'
import { ProfilePage, profileLoader } from './ProfilePage'

const PROFILE = {
  username: 'kairo.wav',
  displayUsername: 'Kairo.wav',
  cardNumber: 42,
  joinedAt: Date.UTC(2026, 2, 10),
  xp: 0,
  bio: 'Flips de soul con 808 de barrio.',
  city: 'Sants, Barcelona',
  links: { instagram: 'https://instagram.com/kairo.wav', youtube: 'https://youtube.com/@kairo' },
  accent: 'red',
  avatarUrl: null,
  game: EMPTY_PROFILE_GAME,
}

/** Un perfil con cuatro semanas selladas (dos victorias, un 3.º y una sin clasificar) y algún logro. */
const PLAYED: ProfileGame = {
  level: 9,
  stats: {
    bestPosition: 1,
    streak: { current: 2, best: 3 },
    meanScoreMilli: 4300,
    goldenEars: 1,
    votesCast: 312,
    season: { id: '2026-T4', points: 58, position: 3 },
  },
  history: [
    {
      weekNumber: 40,
      position: 1,
      title: 'Neón en Sants',
      alias: 'Faro Errante',
      votes: 41,
      scoreMilli: 4620,
    },
    {
      weekNumber: 39,
      position: null,
      title: 'Cumbia de ascensor',
      alias: 'Galgo Lunar',
      votes: 2,
      scoreMilli: 3100,
    },
    {
      weekNumber: 38,
      position: 3,
      title: 'Bruma en el puerto',
      alias: 'Sirena Turbia',
      votes: 39,
      scoreMilli: 4450,
    },
    {
      weekNumber: 37,
      position: 1,
      title: 'Cinta de la abuela',
      alias: 'Trueno Lento',
      votes: 30,
      scoreMilli: 4580,
    },
  ].map((row) => ({
    ...row,
    weekSlug: `2026-w${row.weekNumber}`,
    entryId: `e-${row.weekNumber}`,
    cover: { kind: 'generative' as const, seed: row.weekNumber },
  })),
  achievements: [
    { id: 'first_vote', unlockedAt: Date.UTC(2026, 8, 1) },
    { id: 'win', unlockedAt: Date.UTC(2026, 8, 20) },
    { id: 'night_owl', unlockedAt: Date.UTC(2026, 8, 3) },
  ],
  showcase: ['win'],
}

function mockProfiles(byName: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const name = decodeURIComponent(String(input).split('/').pop() ?? '').toLowerCase()
      const profile = byName[name]
      return profile
        ? new Response(JSON.stringify({ data: profile }), { headers: { 'content-type': 'application/json' } })
        : new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: '' } }), {
            status: 404,
            headers: { 'content-type': 'application/json' },
          })
    }),
  )
}

function renderProfile(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/p/:username',
        loader: profileLoader,
        element: <ProfilePage />,
        errorElement: <h1>404</h1>,
      },
    ],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return router
}

afterEach(() => {
  vi.unstubAllGlobals()
  useSession.setState({ status: 'loading', me: null })
})

describe('perfil público (§3.8.10)', () => {
  it('RF-PRF-01: enseña número y antigüedad, nombre, rango y nivel, ciudad, bio, enlaces y las seis teselas', async () => {
    mockProfiles({ 'kairo.wav': PROFILE })
    renderProfile('/p/kairo.wav')
    expect(await screen.findByRole('heading', { level: 1, name: 'Kairo.wav' })).toBeInTheDocument()
    expect(screen.getByText('Productor #0042 · En la batalla desde marzo de 2026')).toBeInTheDocument()
    expect(screen.getByText('Flips de soul con 808 de barrio.')).toBeInTheDocument()
    expect(screen.getByText(/Sants, Barcelona/)).toBeInTheDocument()
    const links = screen.getByRole('navigation', {
      name: t('pages.profile.linksLabel', { name: 'Kairo.wav' }),
    })
    const instagram = within(links).getByRole('link', { name: /^Instagram/ })
    expect(instagram).toHaveTextContent(t('pages.profile.newTab'))
    expect(instagram).toHaveAttribute('href', 'https://instagram.com/kairo.wav')
    expect(instagram).toHaveAttribute('rel', 'noopener noreferrer me')
    expect(within(links).queryByRole('link', { name: t('pages.profile.edit') })).toBeNull()
    const tiles = screen.getByRole('region', { name: t('pages.profile.tilesLabel') })
    expect(within(tiles).getAllByRole('term')).toHaveLength(6)
    // §1.3: la semana en curso no aparece hasta el sellado.
    expect(screen.getByText(t('pages.profile.history.pending'))).toBeInTheDocument()
    expect(screen.getByRole('article', { name: /Kairo\.wav, número 42/ })).toBeInTheDocument()
  })

  it('RF-PRF-01: un nombre que no existe pinta la 404', async () => {
    mockProfiles({})
    renderProfile('/p/nadie')
    expect(await screen.findByRole('heading', { name: '404' })).toBeInTheDocument()
  })

  it('RF-PRF-03: el nombre anterior (la API ya ha seguido el 301) cambia la URL al nuevo', async () => {
    mockProfiles({ kairo: PROFILE, 'kairo.wav': PROFILE })
    const router = renderProfile('/p/kairo')
    expect(await screen.findByRole('heading', { level: 1, name: 'Kairo.wav' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/p/kairo.wav')
  })

  it('el propio perfil lleva a editarlo', async () => {
    mockProfiles({ 'kairo.wav': PROFILE })
    useSession.setState({
      status: 'signedIn',
      me: {
        id: 'u1',
        email: 'k@example.com',
        emailVerified: true,
        username: 'kairo.wav',
        displayUsername: 'Kairo.wav',
        role: 'user',
        cardNumber: 42,
        xp: 0,
        avatarUrl: null,
        game: EMPTY_ME_GAME,
      },
    })
    renderProfile('/p/kairo.wav')
    expect(await screen.findByRole('link', { name: t('pages.profile.edit') })).toHaveAttribute(
      'href',
      '/ajustes/perfil',
    )
  })

  it('RF-PRF-01: las seis teselas cuentan las semanas selladas (mejor puesto ×2, racha, media, oído de oro, votos y temporada)', async () => {
    mockProfiles({ 'kairo.wav': { ...PROFILE, game: PLAYED } })
    renderProfile('/p/kairo.wav')
    const tiles = await screen.findByRole('region', { name: t('pages.profile.tilesLabel') })
    const values = within(tiles)
      .getAllByRole('definition')
      .map((value) => value.textContent?.replace(/\s+/g, ' ').trim())
    expect(values).toEqual([
      '1.º ×2',
      '2 sem. · mejor 3',
      '4,30',
      '1 vez',
      '312',
      `3.º ${t('pages.profile.tiles.seasonLink', { season: '2026-T4' })} 58 pts`,
    ])
    expect(within(tiles).getByRole('link', { name: /3\.º/ })).toHaveAttribute('href', '/temporada/2026-T4')
  })

  it('RF-PRF-01 / RNF-PRIV-04: el historial de combates, solo semanas selladas, con era, votos, puesto, puntuación y medalla', async () => {
    mockProfiles({ 'kairo.wav': { ...PROFILE, game: PLAYED } })
    renderProfile('/p/kairo.wav')
    const history = await screen.findByRole('region', { name: t('pages.profile.history.title') })
    const rows = within(history).getAllByRole('link')
    expect(rows).toHaveLength(4)
    expect(rows[0]).toHaveAttribute('href', '/e/e-40')
    expect(rows[0]).toHaveTextContent('Neón en Sants')
    expect(rows[0]).toHaveTextContent(/S40 · era Faro Errante · 41.votos/)
    expect(rows[0]).toHaveTextContent('1.º')
    expect(rows[0]).toHaveTextContent('4,62')
    expect(
      within(rows[0] as HTMLElement).getByRole('img', { name: t('ui.medal.place1') }),
    ).toBeInTheDocument()
    expect(rows[1]).toHaveTextContent(t('pages.profile.history.unranked'))
    expect(within(history).getByText(t('pages.profile.history.pending'))).toBeInTheDocument()
    // La gráfica, con su tabla para el lector: de la semana más antigua a la más reciente.
    const chart = screen.getByRole('region', { name: t('pages.profile.chart.title') })
    const table = within(chart).getByRole('table', { name: t('pages.profile.chart.caption') })
    expect(
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.textContent),
    ).toEqual(['S371.º', 'S383.º', `S39${t('pages.profile.history.unranked')}`, 'S401.º'])
  })

  it('RF-GAME-05: los logros conseguidos con su nombre; los que faltan, en silueta; los ocultos, «???» con su pista', async () => {
    mockProfiles({ 'kairo.wav': { ...PROFILE, game: PLAYED } })
    renderProfile('/p/kairo.wav')
    const grid = await screen.findByRole('listbox', { name: t('pages.profile.achievements.title') })
    const options = within(grid).getAllByRole('option')
    expect(options).toHaveLength(12)
    // Primero los conseguidos (por el catálogo: el oculto conseguido ya dice su nombre).
    expect(options.slice(0, 3).map((option) => option.getAttribute('aria-label'))).toEqual([
      'Primer veredicto, común',
      'Disco de oro, épico',
      'Búho, raro',
    ])
    expect(options[3]?.getAttribute('aria-label')).toBe(
      `Primer sample, común, sin conseguir: ${t('achievement.first_drop.description')}`,
    )
    expect(
      screen.getByText(t('pages.profile.achievements.count', { unlocked: 3, total: 36 })),
    ).toBeInTheDocument()
    // «Ver los 36 logros» (L): al final, los ocultos que faltan, «???» con su pista.
    await userEvent.keyboard('l')
    const all = within(grid).getAllByRole('option')
    expect(all).toHaveLength(36)
    expect(all.at(-1)?.getAttribute('aria-label')).toBe(
      `${t('ui.achievement.hiddenName')}, raro, sin conseguir: ${t('achievement.revetlla.hint')}`,
    )
    expect(all.at(-1)).toHaveTextContent('???')
    // El cursor sobre una insignia enseña su ficha debajo.
    await userEvent.click(all[1] as HTMLElement)
    expect(screen.getByText(t('achievement.win.description'))).toBeInTheDocument()
  })

  it('§3.4.4: C gira la carta y las variantes ganadas se pueden ver; las demás dicen cómo se ganan', async () => {
    mockProfiles({ 'kairo.wav': { ...PROFILE, xp: 20_000, game: PLAYED } })
    renderProfile('/p/kairo.wav')
    const card = await screen.findByRole('article', { name: /holográfica/ })
    expect(card).toHaveAttribute('data-side', 'front')
    await userEvent.keyboard('c')
    expect(card).toHaveAttribute('data-side', 'back')
    expect(screen.getByRole('button', { name: t('pages.profile.card.flip') })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const variants = screen.getByRole('group', { name: t('pages.profile.card.variants') })
    const champion = within(variants).getByRole('button', { name: /Campeón/ })
    expect(champion).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(champion)
    expect(card).toHaveAttribute('data-variant', 'holo')
    await userEvent.click(within(variants).getByRole('button', { name: 'Roja' }))
    await waitFor(() => expect(card).toHaveAttribute('data-variant', 'red'))
  })
})
