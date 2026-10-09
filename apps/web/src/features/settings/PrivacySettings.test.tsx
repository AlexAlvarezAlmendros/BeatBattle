import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../i18n'
import { useSession } from '../account/session'
import { PrivacySettingsPage } from './PrivacySettings'

const ME = {
  id: 'u1',
  email: 'aina@example.com',
  emailVerified: true,
  username: 'aina.beats',
  displayUsername: 'Aina.Beats',
  role: 'user' as const,
  cardNumber: 7,
  xp: 0,
  avatarUrl: null,
}

function renderPage() {
  const router = createMemoryRouter([{ path: '*', element: <PrivacySettingsPage /> }], {
    initialEntries: ['/ajustes/privacidad'],
  })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  useSession.setState({ status: 'loading', me: null })
})

describe('Ajustes → Privacidad (§4.14)', () => {
  it('RF-PRF-05: descargar los datos es un enlace de descarga a /api/me/export', () => {
    useSession.setState({ status: 'signedIn', me: ME })
    renderPage()
    const link = screen.getByRole('link', { name: t('settings.privacy.export.download') })
    expect(link).toHaveAttribute('href', '/api/me/export')
    expect(link).toHaveAttribute('download')
  })

  it('RF-PRF-04: borrar pide escribir el nombre; con él, borra, cierra la sesión y lo dice', async () => {
    const calls: { method: string; url: string; body: unknown }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({
          method: init?.method ?? 'GET',
          url: String(input),
          body: JSON.parse(String(init?.body)),
        })
        return new Response(JSON.stringify({ data: { deleted: true } }), {
          headers: { 'content-type': 'application/json' },
        })
      }),
    )
    useSession.setState({ status: 'signedIn', me: ME })
    renderPage()
    expect(screen.getByText(t('settings.privacy.delete.kept'))).toBeInTheDocument()
    const submit = screen.getByRole('button', { name: t('settings.privacy.delete.submit') })
    expect(submit).toHaveAttribute('aria-disabled', 'true')
    await userEvent.type(screen.getByLabelText(t('settings.privacy.delete.confirmLabel')), 'AINA.BEATS')
    expect(submit).not.toHaveAttribute('aria-disabled')
    await userEvent.click(submit)
    expect(await screen.findByText(t('settings.privacy.delete.done'))).toBeInTheDocument()
    expect(calls).toEqual([{ method: 'DELETE', url: '/api/me', body: { confirm: 'AINA.BEATS' } }])
    expect(useSession.getState().status).toBe('anonymous')
  })
})
