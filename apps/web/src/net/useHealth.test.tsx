import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { ApiClientError } from './api'
import { queryKeys } from './queryKeys'
import { useHealth } from './useHealth'

let fetchMock: Mock<typeof fetch>

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } })
  return {
    client,
    Wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  }
}

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('useHealth', () => {
  it('pide /api/health y devuelve el estado validado', async () => {
    fetchMock.mockResolvedValue(respond({ data: { status: 'ok', db: 'up', time: 1_790_000_000_000 } }))
    const { client, Wrapper } = wrapper()
    const { result } = renderHook(() => useHealth(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ status: 'ok', db: 'up', time: 1_790_000_000_000 })
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/health')
    expect(client.getQueryData(queryKeys.health())).toEqual(result.current.data)
  })

  it('un 503 llega como ApiClientError SERVICE_UNAVAILABLE tras reintentar', async () => {
    fetchMock.mockImplementation(async () =>
      respond(
        {
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Servicio no disponible.', details: { db: 'down' } },
        },
        503,
      ),
    )
    const { Wrapper } = wrapper()
    const { result } = renderHook(() => useHealth(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(ApiClientError)
    expect(result.current.error).toMatchObject({ code: 'SERVICE_UNAVAILABLE', status: 503 })
    // 1 intento + 2 reintentos (5xx es reintentable)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('un 4xx no se reintenta', async () => {
    fetchMock.mockImplementation(async () => respond({ error: { code: 'NOT_FOUND', message: 'No.' } }, 404))
    const { Wrapper } = wrapper()
    const { result } = renderHook(() => useHealth(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
