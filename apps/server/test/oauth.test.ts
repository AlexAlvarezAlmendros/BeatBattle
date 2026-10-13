import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAccount, makeApp, ORIGIN, type TestApp, testConfig } from './helpers'

/**
 * Google y Discord simulados (tarea 2.22, `RF-AUTH-05`): se interceptan los endpoints de token y de perfil
 * de cada proveedor; el resto del flujo (estado, PKCE, cookies, vinculación, sesión) es el de Better Auth.
 */

interface FakeUser {
  id: string
  email: string
  verified: boolean
  name: string
}

let googleUser: FakeUser | null = null
let discordUser: FakeUser | null = null
const realFetch = globalThis.fetch

const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })

beforeEach(() => {
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url.startsWith('https://oauth2.googleapis.com/token') && googleUser) {
      const idToken = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
        iss: 'https://accounts.google.com',
        aud: 'google-test',
        sub: googleUser.id,
        email: googleUser.email,
        email_verified: googleUser.verified,
        name: googleUser.name,
      })}.firma`
      return json({
        access_token: 'g-token',
        id_token: idToken,
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'openid email profile',
      })
    }
    if (url.startsWith('https://discord.com/api/oauth2/token') && discordUser)
      return json({
        access_token: 'd-token',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'identify email',
      })
    // betterFetch codifica la «@» de la ruta.
    if (/^https:\/\/discord\.com\/api\/users\/(@|%40)me/.test(url) && discordUser)
      return json({
        id: discordUser.id,
        username: discordUser.name,
        global_name: discordUser.name,
        email: discordUser.email,
        verified: discordUser.verified,
        avatar: null,
        discriminator: '0',
      })
    return realFetch(input, init)
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  googleUser = null
  discordUser = null
})

async function oauthApp(): Promise<TestApp> {
  const base = testConfig()
  return makeApp({
    config: {
      auth: {
        ...base.auth,
        google: { clientId: 'google-test', clientSecret: 'google-secret' },
        discord: { clientId: 'discord-test', clientSecret: 'discord-secret' },
      },
    },
  })
}

const cookiesOf = (raw: string | string[] | undefined) =>
  (Array.isArray(raw) ? raw : raw ? [raw] : []).map((cookie) => cookie.split(';')[0]).join('; ')

/** Empieza en «Entrar con …», vuelve del proveedor con un código y devuelve la respuesta del callback. */
async function signInWith(t: TestApp, provider: 'google' | 'discord') {
  const start = await t.app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/social',
    headers: { origin: ORIGIN },
    payload: { provider, callbackURL: '/', newUserCallbackURL: '/bienvenida', errorCallbackURL: '/entrar' },
  })
  expect(start.statusCode, start.body).toBe(200)
  const state = new URL(start.json().url).searchParams.get('state') as string
  const callback = await t.app.inject({
    method: 'GET',
    url: `/api/auth/callback/${provider}?code=codigo&state=${encodeURIComponent(state)}`,
    headers: { cookie: cookiesOf(start.headers['set-cookie']) },
  })
  const session = cookiesOf(callback.headers['set-cookie'])
    .split('; ')
    .find((cookie) => cookie.startsWith('bb.session_token='))
  const me = session
    ? (await t.app.inject({ method: 'GET', url: '/api/me', headers: { cookie: session } })).json().data
    : null
  return { location: String(callback.headers.location ?? ''), me }
}

describe('Google y Discord (RF-AUTH-05)', () => {
  it('RF-AUTH-05: entrar con Google con el email de una cuenta existente verificada entra en esa cuenta', async () => {
    const t = await oauthApp()
    const { id } = await createAccount(t, { email: 'aina@example.com', username: 'aina' })
    googleUser = { id: 'g-1', email: 'Aina@example.com', verified: true, name: 'Aina Puig' }
    const { location, me } = await signInWith(t, 'google')
    expect(location).not.toMatch(/error/)
    expect(me).toMatchObject({ id, username: 'aina' })
    const accounts = await t.db.$client.execute({
      sql: 'select provider_id from account where user_id = ?',
      args: [id],
    })
    expect(accounts.rows.map((row) => row.provider_id).sort()).toEqual(['credential', 'google'])
    // La segunda vez entra por la cuenta ya vinculada.
    expect((await signInWith(t, 'google')).me).toMatchObject({ id })
  })

  it('RF-AUTH-05: un email que el proveedor no ha verificado no se vincula (entraría en la cuenta de otro)', async () => {
    const t = await oauthApp()
    await createAccount(t, { email: 'aina@example.com', username: 'aina' })
    discordUser = { id: '81384788765712384', email: 'aina@example.com', verified: false, name: 'impostor' }
    const { location, me } = await signInWith(t, 'discord')
    expect(me).toBeNull()
    expect(location).toMatch(/\/entrar\?error=account_not_linked/)
  })

  it('RF-AUTH-05: tampoco con una cuenta local sin verificar', async () => {
    const t = await oauthApp()
    await createAccount(t, { email: 'nueva@example.com', username: 'nueva', verify: false })
    googleUser = { id: 'g-2', email: 'nueva@example.com', verified: true, name: 'Nueva' }
    const { me, location } = await signInWith(t, 'google')
    expect(me).toBeNull()
    expect(location).toMatch(/error=account_not_linked/)
  })

  it('una cuenta nueva por Discord sale verificada, con nombre de productor libre, carta y bienvenida', async () => {
    const t = await oauthApp()
    await createAccount(t, { email: 'kairo@example.com', username: 'kairo.wav' })
    discordUser = { id: '81384788765712385', email: 'otro@example.com', verified: true, name: 'Kairo.wav' }
    const first = await signInWith(t, 'discord')
    expect(first.location).toMatch(/\/bienvenida$/)
    expect(first.me).toMatchObject({ username: 'kairo.wav2', emailVerified: true, cardNumber: 2 })
    googleUser = { id: 'g-3', email: 'admin.beats@example.com', verified: true, name: 'Ádmin' }
    // «admin» es reservado: se prueba con el email («admin.beats»), que vale.
    expect((await signInWith(t, 'google')).me).toMatchObject({ username: 'admin.beats' })
  })
})
