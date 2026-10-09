import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../i18n'
import { useSession } from '../account/session'
import { ProfileSettingsPage } from './ProfileSettings'

const PROFILE = {
  username: 'aina',
  displayUsername: 'aina',
  cardNumber: 7,
  joinedAt: Date.UTC(2026, 9, 1),
  xp: 0,
  bio: null,
  city: null,
  links: {},
  accent: 'red',
  avatarUrl: null,
  usernameChangeAvailableAt: null,
}

type Call = { method: string; path: string; body: unknown }

function mockApi(reply: (call: Call) => { status?: number; body: unknown }) {
  const calls: Call[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const call = {
        method: init?.method ?? 'GET',
        path: new URL(String(input), 'http://localhost').pathname,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      }
      calls.push(call)
      const { status = 200, body } = reply(call)
      return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    }),
  )
  return calls
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([{ path: '*', element: <ProfileSettingsPage /> }], {
    initialEntries: ['/ajustes/perfil'],
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  useSession.setState({ status: 'loading', me: null })
})

describe('Ajustes → Perfil (§2.3)', () => {
  it('guarda solo lo que cambia; un enlace que no es de su sitio, error en su campo', async () => {
    const calls = mockApi(({ method, path, body }) => {
      if (path === '/api/me/profile' && method === 'GET') return { body: { data: PROFILE } }
      const links = (body as { links?: Record<string, string> }).links
      if (links?.spotify)
        return {
          status: 422,
          body: { error: { code: 'INVALID_LINK', message: '', details: { kind: 'spotify' } } },
        }
      return { body: { data: { ...PROFILE, ...(body as object), links: links ?? {} } } }
    })
    useSession.setState({ status: 'signedIn', me: null })
    renderPage()
    await userEvent.type(await screen.findByLabelText(t('settings.profile.card.city')), 'Girona')
    await userEvent.click(screen.getByRole('button', { name: t('settings.profile.card.accents.wine') }))
    await userEvent.type(screen.getByLabelText('Spotify'), 'https://evil.example/x')
    await userEvent.click(screen.getByRole('button', { name: new RegExp(t('settings.profile.save')) }))
    expect(await screen.findByText(/Ese enlace no es de Spotify/)).toBeInTheDocument()
    expect(calls.at(-1)?.body).toEqual({
      city: 'Girona',
      accent: 'wine',
      links: { spotify: 'https://evil.example/x' },
    })
    await userEvent.clear(screen.getByLabelText('Spotify'))
    await userEvent.click(screen.getByRole('button', { name: new RegExp(t('settings.profile.save')) }))
    await waitFor(() =>
      expect(screen.getAllByRole('status').at(-1)).toHaveTextContent(t('settings.profile.saved')),
    )
    expect(calls.at(-1)?.body).toEqual({ city: 'Girona', accent: 'wine' })
  })

  it('RF-PRF-03: el nombre dice cuándo podrá cambiarse y traduce los errores', async () => {
    const availableAt = Date.UTC(2026, 10, 7, 12)
    mockApi(({ method }) =>
      method === 'GET'
        ? { body: { data: PROFILE } }
        : {
            status: 409,
            body: { error: { code: 'USERNAME_CHANGE_TOO_SOON', message: '', details: { availableAt } } },
          },
    )
    useSession.setState({ status: 'signedIn', me: null })
    renderPage()
    const field = await screen.findByLabelText(t('settings.profile.username.label'))
    const submit = screen.getByRole('button', { name: t('settings.profile.username.submit') })
    expect(submit).toHaveAttribute('aria-disabled', 'true')
    await userEvent.clear(field)
    await userEvent.type(field, 'aina.beats')
    // Habilitado, el botón se vuelve a montar (sin el motivo de deshabilitado): se busca otra vez.
    await userEvent.click(screen.getByRole('button', { name: t('settings.profile.username.submit') }))
    expect(
      await screen.findByText(/Ya lo cambiaste hace menos de 30.días\. Podrás el 7 de noviembre de 2026\./),
    ).toBeInTheDocument()
  })
})
