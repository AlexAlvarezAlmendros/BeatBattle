import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderInRouter } from '../../app/layout/testing'
import { UnsubscribePage } from './UnsubscribePage'

function mockApi() {
  const calls: { method: string; url: string; body?: unknown }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      const data =
        method === 'GET'
          ? { kind: 'battle.reminder', family: 'battle', email: 'a•••@example.com' }
          : { scope: JSON.parse(String(init?.body)).scope }
      return new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
  return calls
}

afterEach(() => vi.unstubAllGlobals())

describe('página de baja (§2.12.4)', () => {
  it('RF-NOTIF-05: dice a quién y de qué, y con ↑↓ e Intro (sin tocar nada antes) aplica la baja de todo', async () => {
    const calls = mockApi()
    renderInRouter(<UnsubscribePage />, '/baja?token=abc')
    expect(await screen.findByText('Para a•••@example.com')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Solo estos/ })).toHaveTextContent('Recordatorio para subir')
    const user = userEvent.setup()
    await user.keyboard('{ArrowDown}{Enter}')
    expect(await screen.findByText(/ya solo recibirás los emails imprescindibles/)).toHaveFocus()
    expect(document.activeElement).toHaveTextContent('ya solo recibirás los emails imprescindibles')
    expect(calls.at(-1)).toMatchObject({ method: 'POST', body: { token: 'abc', scope: 'all' } })
  })

  it('«Solo estos» da de baja de ese tipo', async () => {
    const calls = mockApi()
    renderInRouter(<UnsubscribePage />, '/baja?token=abc')
    await userEvent.click(await screen.findByRole('menuitem', { name: /Solo estos/ }))
    await waitFor(() => expect(document.activeElement).toHaveTextContent('«Recordatorio para subir»'))
    expect(calls.at(-1)?.body).toEqual({ token: 'abc', scope: 'kind' })
  })

  it('sin token, explica que el enlace no vale y no llama a la API', async () => {
    const calls = mockApi()
    renderInRouter(<UnsubscribePage />, '/baja')
    expect(screen.getByRole('alert')).toHaveTextContent('no vale')
    expect(calls).toHaveLength(0)
  })
})
