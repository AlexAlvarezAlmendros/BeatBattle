import { type APIRequestContext, type Browser, expect, type Page, test } from '@playwright/test'
import { open, runSuffix, testIp } from './support'

/**
 * E2E del hito de la Fase 2 (guía §5, tarea 2.24; `RF-AUTH-04`, `RNF-SEC-03`): una cuenta de principio a fin
 * con el `Mailer` en memoria (el buzón de los E2E, `/api/test/mailbox`) y «A contra B». Cada prueba manda su
 * propia IP (`X-Forwarded-For`, la API de los E2E confía en el proxy): el registro admite 3 altas por hora y
 * por IP (§4.13). Entrar con Google llega con la 2.22.
 */

const PASSWORD = 'lluvia en gràcia 92'

async function lastLink(request: APIRequestContext, email: string): Promise<string> {
  const mailbox = await (await request.get(`/api/test/mailbox?to=${encodeURIComponent(email)}`)).json()
  const link = String(mailbox.data?.text ?? '').match(/https?:\/\/\S+verify-email\?\S+/)?.[0]
  if (!link) throw new Error(`sin enlace de verificación para ${email}`)
  return link
}

/** Una cuenta verificada con su sesión en un contexto propio (con su IP), por la API. */
async function verifiedAccount(
  browser: Browser,
  baseURL: string,
  ip: string,
  email: string,
  username: string,
) {
  const context = await browser.newContext({ baseURL, extraHTTPHeaders: { 'x-forwarded-for': ip } })
  const page = await context.newPage()
  const res = await page.request.post('/api/auth/sign-up/email', {
    headers: { origin: baseURL },
    data: { email, password: PASSWORD, name: username, username, callbackURL: '/' },
  })
  expect(res.ok(), await res.text()).toBe(true)
  await page.request.get(await lastLink(page.request, email))
  return { context, page }
}

const hud = (page: Page) => page.getByRole('banner')

test.describe('hito de la Fase 2: una cuenta de principio a fin', () => {
  test('RF-AUTH-04: registro → email → verificar → bienvenida → perfil → avisos → baja → borrar la cuenta', async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(120_000)
    await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': testIp(24) })
    const run = runSuffix()
    const email = `hito${run}@example.com`
    const name = `Hito${run}.Wav`
    const username = name.toLowerCase()

    // Registro desde «NUEVO JUGADOR», quitando un aviso.
    await open(page, '/registro', 'Crear cuenta')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Nombre de productor').fill(name)
    await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: /Rango y logros/ }).click()
    await page.getByRole('button', { name: /^Crear cuenta(?! con)/ }).click()
    await expect(page).toHaveURL(/\/verificar\?email=/)

    // El email capturado lleva el enlace; al abrirlo, la sesión queda iniciada y se sigue a la bienvenida.
    await page.goto(await lastLink(page.request, email))
    await expect(page.getByText(`Email confirmado, ${name}.`)).toBeVisible()
    await page.getByRole('link', { name: /^Ver mi carta/ }).click()
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(
      'Bienvenido a la batalla',
    )
    const me = await (await page.request.get('/api/me')).json()
    expect(me.data).toMatchObject({ username, emailVerified: true })

    // Perfil: editarlo en Ajustes y verlo en público.
    await open(page, '/ajustes/perfil', 'Perfil')
    // Con sesión, el HUD lleva la ficha del jugador (la bienvenida va en el marco simple, sin HUD de jugador).
    await expect(hud(page)).toContainText(name)
    await page.getByLabel('Ciudad').fill('Lleida')
    await page.getByRole('button', { name: /Guardar perfil/ }).click()
    await expect(page.getByText('Perfil guardado.')).toBeVisible()
    await open(page, `/p/${username}`, name)
    await expect(page.getByRole('main')).toContainText('Lleida')

    // Los avisos del registro llegaron a Ajustes → Emails.
    await open(page, '/ajustes/emails', 'Emails')
    await expect(page.getByRole('button', { name: /Rango y logros/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await expect(page.getByRole('button', { name: /Nuevo drop cada lunes/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    // Baja desde el enlace de un aviso: «Todo lo no esencial» apaga todos los avisos.
    const link = await (
      await page.request.get(`/api/test/unsubscribe-link?to=${email}&kind=battle.reminder`)
    ).json()
    await page.goto(link.data.url)
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('Baja de emails')
    await page.getByRole('menuitem', { name: /Todo lo no esencial/ }).click()
    await expect(page.getByText(/ya solo recibirás los emails imprescindibles/)).toBeFocused()
    await open(page, '/ajustes/emails', 'Emails')
    const notices = page.getByRole('group', { name: 'Avisos de la batalla' }).getByRole('button')
    await expect(notices).toHaveCount(8)
    for (const notice of await notices.all()) await expect(notice).toHaveAttribute('aria-pressed', 'false')

    // Borrar la cuenta con la confirmación escrita: fuera la sesión, el perfil y el acceso.
    await open(page, '/ajustes/privacidad', 'Privacidad')
    await page.getByLabel('Escribe tu nombre de productor para confirmar').fill(username)
    await page.getByRole('button', { name: 'Borrar mi cuenta' }).click()
    await expect(page.getByText('Cuenta borrada.')).toBeVisible()
    await expect(hud(page).getByRole('link', { name: /Pulsa para unirte/ })).toBeVisible()
    await open(page, `/p/${username}`, 'Bonus stage')
    const signIn = await page.request.post('/api/auth/sign-in/email', {
      headers: { origin: baseURL as string },
      data: { email, password: PASSWORD },
    })
    expect(signIn.status()).toBe(401)
    const farewell = await (await page.request.get(`/api/test/mailbox?to=${email}`)).json()
    expect(farewell.data.subject).toBe('Tu cuenta se ha borrado')
  })
})

test('RNF-SEC-03: A contra B — A no ve ni cierra las sesiones de B, ni edita su perfil, ni borra su cuenta', async ({
  browser,
  baseURL,
}) => {
  const origin = baseURL as string
  const run = runSuffix()
  const [ana, beto] = [`ana${run}`, `beto${run}`]
  const a = await verifiedAccount(browser, origin, testIp(31), `${ana}@example.com`, ana)
  const b = await verifiedAccount(browser, origin, testIp(32), `${beto}@example.com`, beto)
  const bSessions = (await (await b.page.request.get('/api/me/sessions')).json()).data as { id: string }[]
  expect(bSessions.length).toBeGreaterThan(0)

  // A solo ve las suyas y no puede cerrar las de B.
  const aSessions = (await (await a.page.request.get('/api/me/sessions')).json()).data as { id: string }[]
  expect(aSessions.map((s) => s.id)).not.toContain(bSessions[0]?.id)
  const close = await a.page.request.delete(`/api/me/sessions/${bSessions[0]?.id}`, { headers: { origin } })
  expect(close.status()).toBe(404)

  // Editar «mi» perfil solo cambia el de A.
  await a.page.request.put('/api/me/profile', { headers: { origin }, data: { city: 'Tarragona' } })
  expect((await (await b.page.request.get(`/api/profiles/${beto}`)).json()).data.city).toBeNull()
  expect((await (await a.page.request.get(`/api/profiles/${ana}`)).json()).data.city).toBe('Tarragona')

  // La confirmación del borrado es el nombre propio: con el de B, A no borra nada.
  const wrong = await a.page.request.delete('/api/me', { headers: { origin }, data: { confirm: beto } })
  expect(wrong.status()).toBe(422)
  expect((await b.page.request.get(`/api/profiles/${beto}`)).status()).toBe(200)
  expect((await (await b.page.request.get('/api/me')).json()).data).toMatchObject({ username: beto })

  // Sin sesión, nada de lo propio.
  const anonymous = await browser.newContext({ baseURL: origin })
  for (const path of ['/api/me/sessions', '/api/me/profile', '/api/me/email-prefs', '/api/me/export'])
    expect((await anonymous.request.get(path)).status(), path).toBe(401)
  await Promise.all([a.context.close(), b.context.close(), anonymous.close()])
})
