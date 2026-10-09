import { render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../i18n'
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
    const instagram = within(links).getByRole('link', { name: 'Instagram' })
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
      },
    })
    renderProfile('/p/kairo.wav')
    expect(await screen.findByRole('link', { name: t('pages.profile.edit') })).toHaveAttribute(
      'href',
      '/ajustes/perfil',
    )
  })
})
