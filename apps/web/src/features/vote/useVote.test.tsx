import type { EntryList } from '@beatbattle/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { audio } from '../../audio/engine'
import { queryKeys } from '../../net/queryKeys'
import { starsListen, useVote } from './useVote'

let fetchMock: Mock<typeof fetch>
const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function list(myVote: number | null): EntryList {
  const entry = {
    id: 'e-1',
    weekSlug: '2026-w42',
    alias: 'Tigre Púrpura',
    title: 'Bruma',
    description: null,
    bpm: 140,
    musicalKey: 'Am' as const,
    daw: null,
    genres: [],
    durationMs: 180_000,
    peaks: null,
    gainDb: -6,
    streamUrl: 'https://x/e-1.mp3',
    cover: { kind: 'generative' as const, seed: 1 },
    producer: null,
    mine: false,
    myVote,
  }
  return { weekSlug: '2026-w42', order: 'fair', total: 1, entries: [entry] }
}

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function setup() {
  const client = new QueryClient()
  client.setQueryData(queryKeys.entries.list('2026-w42', ''), list(3))
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(() => useVote({ id: 'e-1', weekSlug: '2026-w42' }), { wrapper: Wrapper })
  const myVote = () =>
    client.getQueryData<EntryList>(queryKeys.entries.list('2026-w42', ''))?.entries[0]?.myVote
  return { result, myVote }
}

describe('voto optimista (§3.8.4, §4.7.2)', () => {
  it('RF-VOTE-02: la lista dice la nota nueva al momento y se queda si el servidor la guarda', async () => {
    let resolve: (value: Response) => void = () => {}
    fetchMock.mockReturnValue(new Promise((r) => (resolve = r)))
    const { result, myVote } = setup()
    let done: Promise<void> = Promise.resolve()
    act(() => {
      done = result.current.vote(5)
    })
    await vi.waitFor(() => expect(myVote()).toBe(5))
    resolve(respond({ data: { entryId: 'e-1', stars: 5, createdAt: 1, updatedAt: 2 } }))
    await act(() => done)
    expect(myVote()).toBe(5)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/entries/e-1/vote')
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'PUT', body: JSON.stringify({ stars: 5 }) })
  })

  it('si no se guarda, vuelve la nota anterior, suena `ui.error` y el error llega a las estrellas', async () => {
    const play = vi.spyOn(audio, 'play').mockImplementation(() => {})
    fetchMock.mockResolvedValue(respond({ error: { code: 'LISTEN_REQUIRED', message: 'Escucha' } }, 409))
    const { result, myVote } = setup()
    await act(async () => {
      await expect(result.current.vote(1)).rejects.toMatchObject({ code: 'LISTEN_REQUIRED' })
    })
    expect(myVote()).toBe(3)
    expect(play).toHaveBeenCalledWith('ui.error')
  })

  it('RF-VOTE-13: quitar el voto lo deja sin nota (y si falla, vuelve)', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    const { result, myVote } = setup()
    await act(() => result.current.unvote())
    expect(myVote()).toBeNull()
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'DELETE' })
  })
})

describe('las estrellas y el recibo', () => {
  it('RF-VOTE-10: hasta que el servidor da el recibo, las estrellas no llegan al umbral', () => {
    expect(starsListen(null, 30_000)).toEqual({ heardMs: 0, thresholdMs: 30_000 })
    const heard = { listenedMs: 31_000, thresholdMs: 30_000, unavailable: false }
    expect(starsListen({ ...heard, qualified: false }, 30_000)).toEqual({
      heardMs: 29_999,
      thresholdMs: 30_000,
    })
    expect(starsListen({ ...heard, qualified: true }, 30_000)).toEqual({
      heardMs: 31_000,
      thresholdMs: 30_000,
    })
  })
})
