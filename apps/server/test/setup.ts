import { beforeEach, vi } from 'vitest'

/**
 * Sin red en los tests: el plugin `haveIBeenPwned` consulta `api.pwnedpasswords.com` en cada registro, y un
 * fallo suyo tumbaba cualquier test que crea una cuenta («Failed to check password»). Aquí ninguna
 * contraseña está filtrada; `auth.test.ts` pone su propio HIBP encima para `RF-AUTH-07`.
 */
beforeEach(() => {
  const realFetch = globalThis.fetch
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input)
    if (!url.includes('api.pwnedpasswords.com')) return realFetch(input, init)
    return new Response('0000000000000000000000000000000000A:1', { status: 200 })
  })
})
