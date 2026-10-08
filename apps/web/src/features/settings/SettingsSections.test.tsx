import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../i18n'
import { authClient } from '../account/authClient'
import { useSession } from '../account/session'
import { AccountSettingsPage } from './AccountSettings'
import { EmailSettingsPage } from './EmailSettings'
import { SessionsSettingsPage } from './SessionsSettings'

// `better-fetch` guarda `fetch` al cargar: el cliente de Better Auth se sustituye entero.
vi.mock('../account/authClient', () => ({
  authClient: { changeEmail: vi.fn(), changePassword: vi.fn(), revokeOtherSessions: vi.fn() },
}))
const auth = vi.mocked(authClient, { deep: true }) as unknown as Record<
  'changeEmail' | 'changePassword' | 'revokeOtherSessions',
  ReturnType<typeof vi.fn>
>

const ME = {
  id: 'u1',
  email: 'aina@example.com',
  emailVerified: true,
  username: 'aina',
  displayUsername: 'Aina',
  role: 'user' as const,
  cardNumber: 7,
  xp: 0,
}

const PREFS = {
  dropOn: true,
  resultsOn: true,
  reminderOn: true,
  juryCallOn: true,
  firstVotesOn: true,
  labelPickOn: true,
  progressOn: true,
  seasonOn: true,
  mondayFormat: 'combined',
  marketing: false,
  otpNewsletter: false,
}

type Reply = { status?: number; body: unknown }
type Handler = (call: { method: string; path: string; body: unknown }) => Reply | undefined

function mockApi(handler: Handler) {
  const calls: { method: string; path: string; body: unknown }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : null
      const url = new URL(request?.url ?? String(input), 'http://localhost')
      const method = (init?.method ?? request?.method ?? 'GET').toUpperCase()
      const raw = init?.body ?? (request ? await request.clone().text() : undefined)
      const body = raw ? JSON.parse(String(raw)) : undefined
      const call = { method, path: url.pathname, body }
      calls.push(call)
      const reply = handler(call) ?? { status: 404, body: { error: { code: 'NOT_FOUND', message: '' } } }
      return new Response(JSON.stringify(reply.body), {
        status: reply.status ?? 200,
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
  return calls
}

function renderPage(element: ReactElement, path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([{ path: '*', element }], { initialEntries: [path] })
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  useSession.setState({ status: 'loading', me: null })
})

describe('Ajustes → Emails (§2.12.4)', () => {
  it('sin sesión, pide entrar dentro del panel y no llama a la API', () => {
    const calls = mockApi(() => undefined)
    useSession.setState({ status: 'anonymous', me: null })
    renderPage(<EmailSettingsPage />, '/ajustes/emails')
    expect(screen.getByText(t('settings.emails.require'))).toBeInTheDocument()
    expect(calls).toHaveLength(0)
  })

  it('RF-NOTIF-01: un interruptor por aviso, el lunes y los dos permisos; cambiar uno lo guarda al momento', async () => {
    const calls = mockApi(({ method, path, body }) => {
      if (path !== '/api/me/email-prefs') return undefined
      return { body: { data: method === 'PUT' ? { ...PREFS, ...(body as object) } : PREFS } }
    })
    useSession.setState({ status: 'signedIn', me: ME })
    renderPage(<EmailSettingsPage />, '/ajustes/emails')
    const progress = await screen.findByRole('button', { name: new RegExp(t('account.notices.progressOn')) })
    const notices = screen.getByRole('group', { name: t('settings.emails.notices.title') })
    expect(within(notices).getAllByRole('button')).toHaveLength(8)
    const consents = screen.getByRole('group', { name: t('settings.emails.consents.title') })
    for (const chip of within(consents).getAllByRole('button'))
      expect(chip).toHaveAttribute('aria-pressed', 'false')
    expect(progress).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(progress)
    expect(progress).toHaveAttribute('aria-pressed', 'false')
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(t('settings.emails.saved')))
    expect(calls.at(-1)).toEqual({ method: 'PUT', path: '/api/me/email-prefs', body: { progressOn: false } })
    await userEvent.click(screen.getByRole('button', { name: new RegExp(t('settings.emails.monday.label')) }))
    await waitFor(() => expect(calls.at(-1)?.body).toEqual({ mondayFormat: 'separate' }))
  })

  it('RF-NOTIF-16: si no se guarda, vuelve atrás y lo dice', async () => {
    mockApi(({ method, path }) => {
      if (path !== '/api/me/email-prefs') return undefined
      if (method === 'PUT') return { status: 500, body: { error: { code: 'INTERNAL', message: '' } } }
      return { body: { data: PREFS } }
    })
    useSession.setState({ status: 'signedIn', me: ME })
    renderPage(<EmailSettingsPage />, '/ajustes/emails')
    const marketing = await screen.findByRole('button', { name: new RegExp(t('account.consents.marketing')) })
    await userEvent.click(marketing)
    expect(await screen.findByRole('alert')).toHaveTextContent(t('settings.emails.saveError'))
    expect(marketing).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('Ajustes → Cuenta (§2.3)', () => {
  it('cambiar el email: misma dirección, error en el campo; otra, a aprobar desde la actual', async () => {
    auth.changeEmail.mockResolvedValue({ data: { status: true }, error: null })
    useSession.setState({ status: 'signedIn', me: ME })
    renderPage(<AccountSettingsPage />, '/ajustes/cuenta')
    expect(screen.getByText(t('settings.account.email.current', { email: ME.email }))).toBeInTheDocument()
    const field = screen.getByLabelText(t('settings.account.email.newLabel'))
    await userEvent.type(field, 'AINA@example.com')
    await userEvent.click(screen.getByRole('button', { name: t('settings.account.email.submit') }))
    expect(screen.getByText(t('settings.account.email.same'))).toBeInTheDocument()
    expect(auth.changeEmail).not.toHaveBeenCalled()
    await userEvent.clear(field)
    await userEvent.type(field, 'nueva@example.com')
    await userEvent.click(screen.getByRole('button', { name: t('settings.account.email.submit') }))
    expect(await screen.findByText(t('settings.account.email.sent'))).toBeInTheDocument()
    expect(auth.changeEmail).toHaveBeenCalledWith({
      newEmail: 'nueva@example.com',
      callbackURL: '/ajustes/cuenta',
    })
  })

  it('cambiar la contraseña: la actual mal, en su campo; bien, cierra las demás por defecto', async () => {
    auth.changePassword
      .mockResolvedValueOnce({ data: null, error: { status: 400, code: 'INVALID_PASSWORD' } })
      .mockResolvedValueOnce({ data: { token: null }, error: null })
    useSession.setState({ status: 'signedIn', me: ME })
    renderPage(<AccountSettingsPage />, '/ajustes/cuenta')
    await userEvent.type(screen.getByLabelText(t('settings.account.password.current')), 'no es esta')
    await userEvent.type(screen.getByLabelText(t('account.fields.newPassword')), 'otra contraseña larga 41')
    const submit = screen.getByRole('button', { name: t('settings.account.password.submit') })
    await userEvent.click(submit)
    expect(await screen.findByText(t('account.errors.invalidPassword'))).toBeInTheDocument()
    expect(auth.changePassword).toHaveBeenCalledWith({
      currentPassword: 'no es esta',
      newPassword: 'otra contraseña larga 41',
      revokeOtherSessions: true,
    })
    await userEvent.click(submit)
    expect(await screen.findByText(t('settings.account.password.changed'))).toBeInTheDocument()
  })
})

describe('Ajustes → Sesiones (§2.3)', () => {
  const SESSIONS = [
    {
      id: 's1',
      device: 'Chrome en Linux',
      createdAt: 1_790_000_000_000,
      lastActiveAt: 1_790_100_000_000,
      current: true,
    },
    { id: 's2', device: null, createdAt: 1_789_000_000_000, lastActiveAt: 1_789_500_000_000, current: false },
  ]

  it('RF-AUTH-10: lista navegador y última actividad; cierra una y «Cerrar las demás»', async () => {
    let list = SESSIONS
    const calls = mockApi(({ method, path }) => {
      if (path === '/api/me/sessions') return { body: { data: list } }
      if (method === 'DELETE' && path === '/api/me/sessions/s2') {
        list = SESSIONS.slice(0, 1)
        return { body: { data: { closed: true } } }
      }
      return undefined
    })
    auth.revokeOtherSessions.mockResolvedValue({ data: { status: true }, error: null })
    useSession.setState({ status: 'signedIn', me: ME })
    renderPage(<SessionsSettingsPage />, '/ajustes/sesiones')
    const sessionList = await screen.findByRole('list', { name: t('settings.sessions.listTitle') })
    const rows = within(sessionList).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Chrome en Linux')
    expect(rows[0]).toHaveTextContent(t('settings.sessions.current'))
    expect(within(rows[0] as HTMLElement).queryByRole('button')).toBeNull()
    expect(rows[1]).toHaveTextContent(t('settings.sessions.unknownDevice'))
    await userEvent.click(screen.getByRole('button', { name: t('settings.sessions.closeOthers') }))
    expect(await screen.findByText(t('settings.sessions.closedOthers'))).toBeInTheDocument()
    expect(auth.revokeOtherSessions).toHaveBeenCalledOnce()
    list = SESSIONS
    await userEvent.click(
      await screen.findByRole('button', {
        name: t('settings.sessions.closeLabel', { device: t('settings.sessions.unknownDevice') }),
      }),
    )
    expect(await screen.findByText(t('settings.sessions.alone'))).toBeInTheDocument()
    expect(calls.some((call) => call.method === 'DELETE' && call.path === '/api/me/sessions/s2')).toBe(true)
  })
})
