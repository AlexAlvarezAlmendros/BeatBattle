import { expect, test } from '@playwright/test'
import { open, runSuffix, testIp } from './support'

/**
 * Auditoría de cookies (guía §4.14, tarea 2.23; `RNF-PRIV-03`): tras registrarse, verificar el email (que
 * inicia la sesión) y recorrer la app, el navegador solo guarda las cookies técnicas de la sesión, con el
 * prefijo `bb` (`__Secure-bb.*` en producción, con HTTPS), `HttpOnly` y `SameSite=Lax`. Nada de analítica
 * ni de terceros: por eso no hay banner.
 */
test('RNF-PRIV-03: tras registrarse y entrar, solo cookies técnicas de sesión (bb.*), HttpOnly y SameSite=Lax', async ({
  page,
  context,
  baseURL,
}) => {
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': testIp(41) })
  const username = `cookies${runSuffix()}`
  const email = `${username}@example.com`
  const signUp = await page.request.post('/api/auth/sign-up/email', {
    headers: { origin: baseURL as string },
    data: {
      email,
      password: 'lluvia en gràcia 92',
      name: username,
      username,
      callbackURL: '/bienvenida',
    },
  })
  expect(signUp.ok(), await signUp.text()).toBe(true)
  // Sin verificar no hay sesión: ninguna cookie todavía.
  expect(await context.cookies()).toEqual([])

  const mailbox = await (await page.request.get(`/api/test/mailbox?to=${email}`)).json()
  const link = String(mailbox.data.text).match(/https?:\/\/\S+verify-email\?\S+/)?.[0]
  expect(link).toBeTruthy()
  await page.goto(link as string)
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(
    'Bienvenido a la batalla',
  )

  // La app entera con sesión: menú, opciones y perfil.
  await open(page, '/', 'Beat Battle')
  await open(page, '/ajustes/cuenta', 'Cuenta')
  await open(page, `/p/${username}`, username)

  const cookies = await context.cookies()
  expect(cookies.length).toBeGreaterThan(0)
  for (const cookie of cookies) {
    expect(cookie.name, `cookie no técnica: ${cookie.name}`).toMatch(/^(__Secure-)?bb\./)
    expect(cookie.httpOnly, `${cookie.name} legible desde JS`).toBe(true)
    expect(cookie.sameSite, cookie.name).toBe('Lax')
    expect(new URL(baseURL as string).hostname).toContain(cookie.domain.replace(/^\./, ''))
  }
  expect(cookies.map((cookie) => cookie.name)).toContain('bb.session_token')
})
