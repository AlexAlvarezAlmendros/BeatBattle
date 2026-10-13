import { type BrowserContext, expect, type Page, test } from '@playwright/test'
import { type Account, battleContext, type Clock, createBattleWeek, signUp } from './battle'
import { expectNoAxeViolations, runSuffix, testIp } from './support'

/**
 * E2E del hito de la Fase 5 (guía §5, tarea 5.21): dos usuarios se votan con el teclado, uno desde «ELIGE
 * ENTRADA» y la ficha y el otro en el Modo Jurado, con el recibo de escucha de verdad (el audio a 4× y el
 * reloj de la API adelantado al empezar a escuchar); y salen los tres avisos de la fase (primeros votos,
 * recordatorio y llamada al jurado) en el `Mailer` en memoria, con el reloj simulado del `tick`. Las reglas
 * de `RF-VOTE-*` una a una están en los tests del servidor (`apps/server/test/votes.test.ts`).
 *
 * La semana es la del 21 de marzo de 2033 (nada más en la BD de los E2E cae ahí).
 */

const CRON_SECRET = 'e2e-cron-secret-0123456789abcdefghij'
/** Sábado 26 a las 18:00 y domingo 27 a las 17:00 en Madrid (UTC+1: aún no ha cambiado la hora). */
const SATURDAY_18 = Date.UTC(2033, 2, 26, 17, 0)
const SUNDAY_17 = Date.UTC(2033, 2, 27, 16, 0)

test.describe.configure({ mode: 'serial' })

/** El audio a 4× (30 s de escucha en ~8 s): lo escuchado sale de `audio.played`, que va en tiempo del medio. */
async function fastAudio(context: BrowserContext) {
  await context.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      this.defaultPlaybackRate = 4
      this.playbackRate = 4
      return play.call(this)
    }
  })
}

/** Al empezar a escuchar, la API va 31 s por delante: el servidor comprueba ese tiempo de reloj. */
function bumpClockOnListen(page: Page, clock: Clock) {
  page.on('response', (response) => {
    if (response.request().method() === 'POST' && /\/api\/entries\/[^/]+\/listen$/.test(response.url()))
      clock.api += 31_000
  })
}

/** Mueve el cursor de la rejilla con → hasta la casilla de `alias`. */
async function focusCell(page: Page, alias: string) {
  await page.getByRole('option').first().focus()
  for (let i = 0; i < 40; i++) {
    const label = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')
    if (label.startsWith(alias)) return
    await page.keyboard.press('ArrowRight')
  }
  throw new Error(`no encuentro «${alias}» en la rejilla`)
}

/** Voto por la API (escucha, reloj +31 s, recibo y voto), para llegar a 5 votos sin pantallas. */
async function apiVote(voter: Account, entryId: string, stars: number, clock: Clock, base: string) {
  const headers = () => ({ origin: base, 'x-bb-test-now': String(clock.api) })
  const started = await voter.page.request.post(`/api/entries/${entryId}/listen`, { headers: headers() })
  expect(started.ok(), await started.text()).toBe(true)
  const { listenId } = (await started.json()).data
  clock.api += 31_000
  const qualified = await voter.page.request.post(`/api/entries/${entryId}/listen/qualify`, {
    headers: headers(),
    data: { listenId },
  })
  expect(qualified.ok(), await qualified.text()).toBe(true)
  const voted = await voter.page.request.put(`/api/entries/${entryId}/vote`, {
    headers: headers(),
    data: { stars },
  })
  expect(voted.ok(), await voted.text()).toBe(true)
}

async function lastMail(page: Page, email: string, contains: string) {
  const res = await page.request.get(
    `/api/test/mailbox?to=${encodeURIComponent(email)}&contains=${encodeURIComponent(contains)}`,
  )
  return (await res.json()).data as { subject: string; text: string } | null
}

test('hito de la Fase 5: dos usuarios se votan con el teclado; recordatorio, llamada al jurado y primeros votos', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(300_000)
  const base = baseURL as string
  const clock: Clock = { api: 0 }
  const week = await createBattleWeek(browser, base, {
    monday: '2033-03-21',
    producers: 7,
    run: runSuffix(),
    ip: testIp,
    clock,
  })
  const [ana, bea, ...others] = week.producers as [
    Account & { entryId: string; alias: string },
    ...(Account & { entryId: string; alias: string })[],
  ]
  if (!bea) throw new Error('faltan productores')
  for (const who of [ana, bea]) {
    await fastAudio(who.page.context())
    bumpClockOnListen(who.page, clock)
    await who.page.clock.install({ time: clock.api })
  }

  await test.step('RF-PLAY-04 / RF-VOTE-03: Ana elige la entrada de Bea en la rejilla con el teclado y la escucha', async () => {
    const page = ana.page
    await page.goto(`/semana/${week.slug}/entradas`)
    await expect(page.getByRole('heading', { level: 1, name: /elige entrada/i })).toBeAttached()
    await expect(page.getByRole('option')).toHaveCount(week.producers.length + 1)
    await expectNoAxeViolations(page)
    await focusCell(page, bea.alias)
    await page.keyboard.press('Enter')
    const bar = page.getByRole('region', { name: 'Reproductor' })
    await expect(bar).toContainText(bea.alias)
    // A los 30 s escuchados (8 s a 4×), el recibo; «Votar» lleva a su ficha.
    await bar.getByRole('link', { name: 'Votar' }).focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`/e/${bea.entryId}$`))
  })

  await test.step('RF-VOTE-10 / RF-VOTE-02: en la ficha, las estrellas despiertan y Ana vota con el teclado', async () => {
    const page = ana.page
    const stars = page.getByRole('radiogroup', { name: new RegExp(bea.alias) })
    await expect(stars).not.toHaveAttribute('aria-disabled', 'true', { timeout: 40_000 })
    await stars.getByRole('radio', { name: /4 de 5/ }).focus()
    const saved = page.waitForResponse((r) => r.url().endsWith(`/api/entries/${bea.entryId}/vote`))
    await page.keyboard.press('4')
    expect((await saved).status()).toBe(200)
    await expect(stars.getByRole('radio', { name: /4 de 5/ })).toHaveAttribute('aria-checked', 'true')
    // En su propia ficha, sin estrellas.
    await page.goto(`/e/${ana.entryId}`)
    await expect(page.getByText(/Es tu entrada/)).toBeVisible()
    await expect(page.getByRole('radiogroup')).toHaveCount(0)
  })

  await test.step('RF-VOTE-09: Bea entra al Modo Jurado desde el menú y puntúa a Ana con 1–5', async () => {
    const page = bea.page
    await page.goto('/')
    await page
      .getByRole('menuitem', { name: /Jurado/ })
      .first()
      .click()
    await expect(page).toHaveURL(/\/jurado$/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Modo Jurado · ronda 1 de/)
    // La cola no lleva la suya; salta (S) hasta la de Ana.
    for (let i = 0; i < week.producers.length; i++) {
      const title = (await page.getByRole('heading', { level: 1 }).textContent()) ?? ''
      expect(title).not.toContain(bea.alias)
      if (title.includes(ana.alias)) break
      await page.keyboard.press('s')
      await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(title)
    }
    await expect(page.getByRole('heading', { level: 1 })).toContainText(ana.alias)
    const stars = page.getByRole('radiogroup', { name: new RegExp(ana.alias) })
    await expect(stars).not.toHaveAttribute('aria-disabled', 'true', { timeout: 40_000 })
    // Espacio pausa y vuelve a sonar (a 4× la pista puede haber acabado ya: entonces la pone otra vez).
    const toggle = page.getByRole('button', { name: /^(Pausa|Escuchar)$/ })
    const before = await toggle.textContent()
    await page.keyboard.press(' ')
    await expect(toggle).not.toHaveText(before ?? '')
    await page.keyboard.press(' ')
    await expect(toggle).toHaveText(before ?? '')
    const saved = page.waitForResponse((r) => r.url().endsWith(`/api/entries/${ana.entryId}/vote`))
    await page.keyboard.press('5')
    expect((await saved).status()).toBe(200)
    await expect(page.getByText('×1')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).not.toContainText(ana.alias)
  })

  await test.step('RF-PLAY-05: la lista sigue sin medias ni recuentos, y cada uno ve su voto', async () => {
    const res = await ana.page.request.get(`/api/weeks/${week.slug}/entries`, {
      headers: { 'x-bb-test-now': String(clock.api) },
    })
    const body = await res.text()
    for (const banned of ['"mean', '"score', '"position', '"votes"']) expect(body).not.toContain(banned)
    expect(JSON.parse(body).data.entries.find((e: { id: string }) => e.id === bea.entryId).myVote).toBe(4)
  })

  await test.step('battle.first_votes: al quinto voto, Ana recibe sus votos y escuchas, sin media', async () => {
    for (const voter of others.slice(0, 4)) await apiVote(voter, ana.entryId, 3, clock, base)
    // Mediodía del martes (fuera de las horas de silencio) y el `tick` envía.
    clock.api = Date.UTC(2033, 2, 22, 11, 0)
    const tick = await ana.page.request.get('/api/cron/tick', {
      headers: { authorization: `Bearer ${CRON_SECRET}`, 'x-bb-test-now': String(clock.api) },
    })
    expect(tick.ok(), await tick.text()).toBe(true)
    const mail = await lastMail(ana.page, ana.email, 'Tu beat ya suena')
    expect(mail?.subject).toBe('Tu beat ya suena: 5 votos')
    expect(mail?.text).not.toMatch(/media|puntuaci[oó]n|posici[oó]n/i)
  })

  await test.step('battle.reminder y battle.jury_call: el sábado a las 18:00 y el domingo a las 17:00', async () => {
    // Quien descargó y no ha subido: una cuenta nueva con las bases y la descarga.
    const context = await battleContext(browser, base, testIp(60), clock)
    const late = await signUp(
      context,
      base,
      `tarde${runSuffix()}@example.com`,
      `tarde${runSuffix()}x`,
      testIp(60),
      clock.api,
    )
    const headers = { origin: base, 'x-bb-test-now': String(clock.api) }
    expect(
      (
        await late.page.request.post(`/api/weeks/${week.slug}/rules`, { headers, data: { rulesVersion: 1 } })
      ).ok(),
    ).toBe(true)
    expect(
      (
        await late.page.request.post(`/api/weeks/${week.slug}/sample/download`, {
          headers,
          data: { kind: 'original' },
        })
      ).ok(),
    ).toBe(true)
    for (const at of [SATURDAY_18, SUNDAY_17]) {
      const tick = await late.page.request.get('/api/cron/tick', {
        headers: { authorization: `Bearer ${CRON_SECRET}`, 'x-bb-test-now': String(at) },
      })
      expect(tick.ok(), await tick.text()).toBe(true)
    }
    expect((await lastMail(late.page, late.email, 'para subir tu flip'))?.subject).toMatch(
      /^Te quedan ~\d+ h para subir tu flip$/,
    )
    // Ana ha votado una y le quedan más de 3 por escuchar.
    expect((await lastMail(late.page, ana.email, 'beats por escuchar'))?.subject).toMatch(
      /^Te quedan \d+ beats por escuchar$/,
    )
    await context.close()
  })
})
