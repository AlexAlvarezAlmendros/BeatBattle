import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSession } from '../account/session'
import {
  listenInterrupted,
  listenProgress,
  listenStarted,
  playedMs,
  resetListenForTests,
  useListen,
} from './listen'

/** `TimeRanges` de mentira: los tramos que han sonado, en segundos. */
function ranges(...spans: [number, number][]): TimeRanges {
  return {
    length: spans.length,
    start: (i) => spans[i]?.[0] ?? 0,
    end: (i) => spans[i]?.[1] ?? 0,
  } as TimeRanges
}

const entry = { id: 'e-1', kind: 'entry' as const, durationMs: 180_000, votable: true }
const calls: { url: string; init: RequestInit | undefined }[] = []
let qualifyAnswer: () => Response

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

beforeEach(() => {
  resetListenForTests()
  calls.length = 0
  qualifyAnswer = () => json(200, { data: { qualifiedAt: 1 } })
  useSession.setState({ status: 'signedIn', me: { id: 'u', emailVerified: true } as never })
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    if (url.endsWith('/listen'))
      return json(200, { data: { listenId: 'l-1', thresholdMs: 30_000, startedAt: 0 } })
    if (url.endsWith('/listen/qualify')) return qualifyAnswer()
    if (url.endsWith('/play')) return json(202, { data: { ok: true } })
    return json(404, { error: { code: 'NOT_FOUND', message: 'x' } })
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  resetListenForTests()
  useSession.setState({ status: 'anonymous', me: null })
})

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('recibo de escucha (§2.7, §4.7.3)', () => {
  it('RF-VOTE-04: lo escuchado es lo que ha sonado; saltar con la onda no suma', () => {
    expect(playedMs(ranges([0, 12], [40, 45]))).toBe(17_000)
    expect(playedMs(ranges())).toBe(0)
  })

  it('RF-VOTE-04: al sonar pide el inicio sin cuerpo; al cumplir 30 s escuchados, el recibo', async () => {
    listenStarted(entry, 0)
    await flush()
    expect(calls[0]?.url).toBe('/api/entries/e-1/listen')
    expect(calls[0]?.init?.body).toBeUndefined()
    listenProgress(entry, ranges([0, 20]), 20)
    await flush()
    expect(useListen.getState().receipts['e-1']).toMatchObject({ listenedMs: 20_000, qualified: false })
    expect(calls.some((call) => call.url.endsWith('/qualify'))).toBe(false)
    // Un salto a 2:00 y 11 s más: 31 s escuchados.
    listenProgress(entry, ranges([0, 20], [120, 131]), 131)
    await flush()
    await flush()
    const qualify = calls.find((call) => call.url.endsWith('/qualify'))
    expect(JSON.parse(String(qualify?.init?.body))).toEqual({ listenId: 'l-1' })
    expect(useListen.getState().receipts['e-1']).toMatchObject({ listenedMs: 31_000, qualified: true })
  })

  it('RF-VOTE-04: si el reloj del servidor aún no llega, vuelve a pedirlo pasado lo que falta', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    let first = true
    qualifyAnswer = () => {
      if (first) {
        first = false
        return json(409, {
          error: { code: 'LISTEN_REQUIRED', message: 'falta', details: { remainingMs: 4000 } },
        })
      }
      return json(200, { data: { qualifiedAt: 2 } })
    }
    listenStarted(entry, 0)
    await vi.advanceTimersByTimeAsync(0)
    listenProgress(entry, ranges([0, 31]), 31)
    await vi.advanceTimersByTimeAsync(0)
    expect(useListen.getState().receipts['e-1']?.qualified).toBe(false)
    await vi.advanceTimersByTimeAsync(4300)
    expect(useListen.getState().receipts['e-1']?.qualified).toBe(true)
    expect(calls.filter((call) => call.url.endsWith('/qualify'))).toHaveLength(2)
  })

  it('RF-VOTE-10: sin cuenta verificada o con la propia, no hay recibo (las estrellas no se ofrecen)', async () => {
    useSession.setState({ status: 'anonymous', me: null })
    listenStarted(entry, 0)
    expect(useListen.getState().receipts['e-1']).toMatchObject({ unavailable: true })
    listenStarted({ ...entry, id: 'e-2', votable: false }, 0)
    expect(useListen.getState().receipts['e-2']).toMatchObject({ unavailable: true })
    await flush()
    expect(calls.some((call) => call.url.includes('/listen'))).toBe(false)
  })
})

describe('escuchas (§2.6)', () => {
  it('RF-PLAY-07: a los 10 s seguidos cuenta una escucha, una vez por sesión; un salto vuelve a empezar', async () => {
    listenStarted(entry, 0)
    listenProgress(entry, ranges([0, 6]), 6)
    listenInterrupted(50) // salto con la onda
    listenProgress(entry, ranges([0, 6], [50, 58]), 58)
    await flush()
    expect(calls.filter((call) => call.url.endsWith('/play'))).toHaveLength(0)
    listenProgress(entry, ranges([0, 6], [50, 60]), 60)
    listenProgress(entry, ranges([0, 6], [50, 75]), 75)
    await flush()
    const plays = calls.filter((call) => call.url.endsWith('/play'))
    expect(plays).toHaveLength(1)
    expect(JSON.parse(String(plays[0]?.init?.body)).playId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('RF-PLAY-07: también sin cuenta, y con el sample no', async () => {
    useSession.setState({ status: 'anonymous', me: null })
    listenStarted(entry, 0)
    listenProgress(entry, ranges([0, 10]), 10)
    const sample = { id: 'sample:1', kind: 'sample' as const, durationMs: 20_000 }
    listenStarted(sample, 0)
    listenProgress(sample, ranges([0, 15]), 15)
    await flush()
    expect(calls.filter((call) => call.url.endsWith('/play')).map((call) => call.url)).toEqual([
      '/api/entries/e-1/play',
    ])
  })
})
