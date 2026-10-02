import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { z } from 'zod'
import { ApiClientError, apiFetch, isRetryable } from './api'

let fetchMock: Mock<typeof fetch>

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })

const schema = z.object({ n: z.number() })

async function failure(promise: Promise<unknown>): Promise<ApiClientError> {
  try {
    await promise
  } catch (e) {
    if (e instanceof ApiClientError) return e
    throw e
  }
  throw new Error('debía fallar')
}

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiFetch', () => {
  it('GET: devuelve data validado con el esquema', async () => {
    fetchMock.mockResolvedValue(json({ data: { n: 7 } }))
    await expect(apiFetch('/api/thing', { schema })).resolves.toEqual({ n: 7 })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/thing')
    expect(init).toMatchObject({ method: 'GET', credentials: 'same-origin', body: undefined })
    expect(init?.headers).toEqual({ Accept: 'application/json' })
  })

  it('con cuerpo: lo serializa y pone Content-Type: application/json', async () => {
    fetchMock.mockResolvedValue(json({ data: { n: 1 } }))
    await apiFetch('/api/thing', { method: 'POST', body: { title: 'Flip' }, schema })
    const init = fetchMock.mock.calls[0]![1]!
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"title":"Flip"}')
    expect(init.headers).toEqual({ Accept: 'application/json', 'Content-Type': 'application/json' })
  })

  it('pasa la señal de cancelación a fetch', async () => {
    fetchMock.mockResolvedValue(json({ data: { n: 1 } }))
    const controller = new AbortController()
    await apiFetch('/api/thing', { schema, signal: controller.signal })
    expect(fetchMock.mock.calls[0]![1]!.signal).toBe(controller.signal)
  })

  it('error del servidor → ApiClientError con código, estado, mensaje y detalles', async () => {
    fetchMock.mockResolvedValue(
      json(
        { error: { code: 'VALIDATION_FAILED', message: 'Datos no válidos.', details: [{ path: 'body.n' }] } },
        422,
      ),
    )
    const e = await failure(apiFetch('/api/thing', { method: 'POST', body: {}, schema }))
    expect(e).toMatchObject({
      name: 'ApiClientError',
      code: 'VALIDATION_FAILED',
      status: 422,
      message: 'Datos no válidos.',
      details: [{ path: 'body.n' }],
    })
  })

  it('429 lleva los segundos de Retry-After', async () => {
    fetchMock.mockResolvedValue(
      json({ error: { code: 'RATE_LIMITED', message: 'Espera.' } }, 429, { 'Retry-After': '45' }),
    )
    const e = await failure(apiFetch('/api/thing', { schema }))
    expect(e.code).toBe('RATE_LIMITED')
    expect(e.retryAfterSeconds).toBe(45)
  })

  it('acepta códigos que este cliente aún no conoce', async () => {
    fetchMock.mockResolvedValue(json({ error: { code: 'VOTING_CLOSED', message: 'Cerrado.' } }, 409))
    expect((await failure(apiFetch('/api/thing', { schema }))).code).toBe('VOTING_CLOSED')
  })

  it('sin respuesta → NETWORK_ERROR con estado 0', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const e = await failure(apiFetch('/api/thing', { schema }))
    expect(e).toMatchObject({ code: 'NETWORK_ERROR', status: 0 })
  })

  it('un 502 en HTML del proxy → BAD_RESPONSE con su estado', async () => {
    fetchMock.mockResolvedValue(
      new Response('<html><body>502 Bad Gateway</body></html>', {
        status: 502,
        headers: { 'Content-Type': 'text/html' },
      }),
    )
    const e = await failure(apiFetch('/api/thing', { schema }))
    expect(e).toMatchObject({ code: 'BAD_RESPONSE', status: 502 })
  })

  it('JSON que no es el sobre, o data que no cumple el esquema → BAD_RESPONSE', async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: true }))
    expect((await failure(apiFetch('/api/thing', { schema }))).code).toBe('BAD_RESPONSE')
    fetchMock.mockResolvedValueOnce(json({ data: { n: 'siete' } }))
    const e = await failure(apiFetch('/api/thing', { schema }))
    expect(e.code).toBe('BAD_RESPONSE')
    expect(e.details).toEqual([expect.objectContaining({ path: 'n' })])
    // un sobre de datos con estado de error tampoco vale
    fetchMock.mockResolvedValueOnce(json({ data: { n: 1 } }, 500))
    expect((await failure(apiFetch('/api/thing', { schema }))).code).toBe('BAD_RESPONSE')
  })

  it('una cancelación se propaga como AbortError, no como error de red', async () => {
    const controller = new AbortController()
    fetchMock.mockImplementation(async () => {
      controller.abort()
      throw new DOMException('Aborted', 'AbortError')
    })
    await expect(apiFetch('/api/thing', { schema, signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    })
  })

  it('exige rutas completas bajo /api/', async () => {
    await expect(apiFetch('health', { schema })).rejects.toThrow(TypeError)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('isRetryable', () => {
  it('reintenta red, respuestas rotas y 5xx; no 4xx ni errores ajenos', () => {
    expect(isRetryable(new ApiClientError('NETWORK_ERROR', 0, ''))).toBe(true)
    expect(isRetryable(new ApiClientError('BAD_RESPONSE', 200, ''))).toBe(true)
    expect(isRetryable(new ApiClientError('SERVICE_UNAVAILABLE', 503, ''))).toBe(true)
    expect(isRetryable(new ApiClientError('NOT_FOUND', 404, ''))).toBe(false)
    expect(isRetryable(new ApiClientError('RATE_LIMITED', 429, ''))).toBe(false)
    expect(isRetryable(new Error('x'))).toBe(false)
  })
})
