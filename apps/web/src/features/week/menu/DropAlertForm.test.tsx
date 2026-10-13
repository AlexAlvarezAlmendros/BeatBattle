import { fireEvent, getDefaultNormalizer, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { t } from '../../../i18n'
import { DropAlertForm } from './DropAlertForm'

let fetchMock: Mock<typeof fetch>
beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('DropAlertForm (§2.12.3)', () => {
  it('RF-NOTIF-09: con un email válido pide la alerta y dice «revisa tu email»', async () => {
    fetchMock.mockResolvedValue(json({ data: { status: 'pending' } }, 202))
    render(<DropAlertForm />)
    fireEvent.change(screen.getByLabelText(t('home.dropAlert.email')), {
      target: { value: 'fan@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: t('home.dropAlert.submit') }))
    await waitFor(() =>
      expect(
        screen.getByText(t('home.dropAlert.sent'), {
          normalizer: getDefaultNormalizer({ collapseWhitespace: false }),
        }),
      ).toBeInTheDocument(),
    )
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/subscribe')
    expect(init?.body).toBe('{"email":"fan@example.com"}')
  })

  it('un email no válido no se envía y el error queda en el campo, con el foco', () => {
    render(<DropAlertForm />)
    const field = screen.getByLabelText(t('home.dropAlert.email'))
    fireEvent.change(field, { target: { value: 'fan@' } })
    fireEvent.click(screen.getByRole('button', { name: t('home.dropAlert.submit') }))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByText(t('home.dropAlert.invalid'))).toBeInTheDocument()
    expect(document.activeElement).toBe(field)
  })

  it('RNF-SEC-02: con el límite superado, lo dice', async () => {
    fetchMock.mockResolvedValue(json({ error: { code: 'RATE_LIMITED', message: 'x' } }, 429))
    render(<DropAlertForm />)
    fireEvent.change(screen.getByLabelText(t('home.dropAlert.email')), {
      target: { value: 'fan@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: t('home.dropAlert.submit') }))
    await waitFor(() => expect(screen.getByText(t('home.dropAlert.rateLimited'))).toBeInTheDocument())
  })
})
