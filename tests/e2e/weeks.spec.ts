import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  test,
} from '@playwright/test'
import { expectNoAxeViolations, runSuffix, testIp } from './support'

/**
 * E2E del hito de la Fase 3 (guía §5, tarea 3.20): el admin sube un sample y marca sus 8 chops
 * (`RF-ADM-01`), programa 3 semanas (`RF-ADM-02`); con el reloj simulado, la home cambia de semana en la
 * frontera, la revelación sale una vez (`RF-DROP-11`), la descarga exige las bases (`RF-DROP-06`) y el
 * `tick` del lunes a las 08:00 manda el email del drop, también al suscriptor sin cuenta (`RF-NOTIF-09`).
 *
 * El reloj: en el navegador, `page.clock`; en la API, la cabecera `x-bb-test-now` (la API de los E2E
 * arranca con `BB_TEST_CLOCK=1`), que pone una ruta a cada petición a `/api` con el instante de `apiNow`.
 * Las semanas son de marzo de 2031 (nada más en la BD de los E2E cae ahí); la del 24 de marzo tiene el
 * cambio de hora y dura 167 h (`RF-DROP-05`).
 */

const PASSWORD = 'lluvia en gràcia 92'
const CRON_SECRET = 'e2e-cron-secret-0123456789abcdefghij'

/** Las tres semanas (2031-w12, w13 y w14), en ms UTC: lunes 00:00 y cierres de Madrid. */
const W12 = { slug: '2031-w12', monday: '2031-03-17', startsAt: 1931468400000, submitEndsAt: 1932058800000 }
const W13 = { slug: '2031-w13', monday: '2031-03-24', startsAt: 1932073200000, voteEndsAt: 1932674400000 }
const W14 = { slug: '2031-w14', monday: '2031-03-31', startsAt: 1932674400000 }
/** El viernes anterior, a mediodía: antes del primer drop. */
const BEFORE = W12.startsAt - 2.5 * 86_400_000
/** Lunes 17 a las 08:00 de Madrid: el email del drop. */
const DROP_MAIL_AT = Date.UTC(2031, 2, 17, 7, 0, 0)

test.describe.configure({ mode: 'serial' })

/** WAV de 6 s con un acorde (para la medición con ffmpeg) y la cabecera de una portada de 1200 px. */
function sampleFiles(seed: number) {
  const rate = 22_050
  const frames = rate * 6
  const wav = Buffer.alloc(44 + frames * 2)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(36 + frames * 2, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(rate, 24)
  wav.writeUInt32LE(rate * 2, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(frames * 2, 40)
  for (let i = 0; i < frames; i++) {
    const t = i / rate
    const v = [220, 262, 330].reduce((sum, f) => sum + Math.sin(2 * Math.PI * (f + seed) * t), 0) / 3
    wav.writeInt16LE(Math.round(v * 0.4 * 32767), 44 + i * 2)
  }
  const png = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0)
  png.writeUInt32BE(13, 8)
  png.write('IHDR', 12)
  png.writeUInt32BE(1200, 16)
  png.writeUInt32BE(1200, 20)
  return { wav, png }
}

/** Un contexto con el reloj simulado en la API (la cabecera en cada `/api`). */
async function clockedContext(browser: Browser, baseURL: string, ip: string, clock: { api: number }) {
  const context = await browser.newContext({ baseURL, extraHTTPHeaders: { 'x-forwarded-for': ip } })
  await context.addInitScript(() => window.sessionStorage.setItem('bb:title-seen', 'yes'))
  await context.route('**/api/**', (route) =>
    route.continue({ headers: { ...route.request().headers(), 'x-bb-test-now': String(clock.api) } }),
  )
  return context
}

async function lastMail(request: APIRequestContext, email: string) {
  const mailbox = await (await request.get(`/api/test/mailbox?to=${encodeURIComponent(email)}`)).json()
  return mailbox.data as { subject: string; text: string } | null
}

/** Una cuenta verificada en el contexto (registro por la API y el enlace del buzón). */
async function signUp(
  context: BrowserContext,
  baseURL: string,
  email: string,
  username: string,
  now: number,
) {
  const page = await context.newPage()
  const res = await page.request.post('/api/auth/sign-up/email', {
    headers: { origin: baseURL, 'x-bb-test-now': String(now) },
    data: { email, password: PASSWORD, name: username, username, callbackURL: '/' },
  })
  expect(res.ok(), await res.text()).toBe(true)
  const link = (await lastMail(page.request, email))?.text.match(/https?:\/\/\S+verify-email\?\S+/)?.[0]
  if (!link) throw new Error(`sin enlace de verificación para ${email}`)
  await page.request.get(link)
  return page
}

/** Sube un sample por la API con la firma, como el panel (el audio va al almacenamiento, no a la API). */
async function apiSample(page: Page, baseURL: string, title: string, seed: number, now: number) {
  const headers = { origin: baseURL, 'x-bb-test-now': String(now) }
  const files = sampleFiles(seed)
  let sampleId: string | undefined
  for (const [part, name, buffer, mimeType] of [
    ['original', 'sample.wav', files.wav, 'audio/wav'],
    ['cover', 'cover.png', files.png, 'image/png'],
  ] as const) {
    const signed = await page.request.post('/api/admin/samples/sign', {
      headers,
      data: sampleId ? { part, sampleId } : { part },
    })
    expect(signed.ok(), await signed.text()).toBe(true)
    const { data } = await signed.json()
    sampleId = data.sampleId
    const upload = await page.request.post(data.upload.uploadUrl, {
      headers: { origin: baseURL },
      multipart: { ...data.upload.fields, file: { name, mimeType, buffer } },
    })
    expect(upload.ok(), await upload.text()).toBe(true)
  }
  const created = await page.request.post('/api/admin/samples', {
    headers,
    data: {
      sampleId,
      title,
      credits: 'E2E',
      licenseText: 'Uso libre en la batalla.',
      bpm: 90,
      musicalKey: 'Am',
    },
  })
  expect(created.ok(), await created.text()).toBe(true)
}

test('hito de la Fase 3: admin, calendario, cambio de semana en la frontera, bases, revelación y email del drop', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000)
  const base = baseURL as string
  const run = runSuffix()
  const clock = { api: BEFORE }
  const adminEmail = `jefa.f3.${run}@example.com`
  const producerEmail = `lilbru.f3.${run}@example.com`
  const fanEmail = `fan.f3.${run}@example.com`

  // ── El admin: un sample con sus 8 chops por el panel y dos más por la API ─────────────────────────────
  const adminContext = await clockedContext(browser, base, testIp(31), clock)
  const admin = await signUp(adminContext, base, adminEmail, `jefa${run}f3`, BEFORE)
  await admin.request.post('/api/test/role', {
    headers: { origin: base },
    data: { email: adminEmail, role: 'admin' },
  })
  await admin.clock.install({ time: BEFORE })

  await test.step('RF-ADM-01: subir sample, marcar 8 chops y guardar', async () => {
    const files = sampleFiles(0)
    await admin.goto('/admin/samples/nuevo')
    await admin
      .locator('input[data-part="original"]')
      .setInputFiles({ name: 'drop.wav', mimeType: 'audio/wav', buffer: files.wav })
    await admin
      .locator('input[data-part="cover"]')
      .setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: files.png })
    await expect(admin.locator('[class*="slotState"]', { hasText: 'Subido' })).toHaveCount(2, {
      timeout: 15_000,
    })
    await admin.getByLabel('Título').fill('Lluvia de marzo')
    await admin.getByLabel('Créditos').fill('Other People Sound Lab')
    await admin.getByLabel('Licencia de uso').fill('Uso libre dentro de la batalla.')
    await admin.getByLabel('BPM').fill('92')
    await admin.getByLabel('Tonalidad').selectOption('Dm')
    await admin.getByRole('button', { name: 'Crear el sample' }).click()
    await expect(admin.getByRole('region', { name: 'Chops del kit de la semana' })).toBeVisible({
      timeout: 20_000,
    })
    await admin.getByRole('button', { name: 'Repartir en 8 iguales' }).click()
    await admin.getByLabel('Inicio (s)').nth(2).fill('2.00')
    await admin.getByRole('button', { name: 'Guardar los chops' }).click()
    await expect(admin.getByText('Chops guardados.')).toBeVisible()
  })
  await apiSample(admin, base, 'Neón de marzo', 40, BEFORE)
  await apiSample(admin, base, 'Siesta de abril', 80, BEFORE)

  await test.step('RF-ADM-02: programar 3 semanas; la del cambio de hora dura 167 h', async () => {
    await admin.goto('/admin')
    const form = admin.locator('form', { hasText: 'Programar una semana' })
    await expect(form).toBeVisible()
    await expectNoAxeViolations(admin)
    for (const [week, title] of [
      [W12, 'Lluvia de marzo'],
      [W13, 'Neón de marzo'],
      [W14, 'Siesta de abril'],
    ] as const) {
      await form.locator('select').first().selectOption(week.monday)
      await form.locator('select').nth(1).selectOption({ label: title })
      await form.getByRole('button', { name: 'Programar la semana' }).click()
      await expect(admin.getByRole('cell', { name: title }).first()).toBeVisible()
    }
    const calendar = await (
      await admin.request.get('/api/admin/weeks', { headers: { 'x-bb-test-now': String(BEFORE) } })
    ).json()
    const w13 = calendar.data.weeks.find((week: { slug: string }) => week.slug === W13.slug)
    expect((w13.voteEndsAt - w13.startsAt) / 3_600_000).toBe(167)
    expect(calendar.data.gaps).not.toContain(W12.monday)
  })

  // ── Un visitante: la alerta de drop sin cuenta ────────────────────────────────────────────────────────
  const fanContext = await clockedContext(browser, base, testIp(32), clock)
  const fan = await fanContext.newPage()
  await fan.clock.install({ time: BEFORE })
  await test.step('RF-NOTIF-09: alta en la alerta desde la home y confirmación en /alerta', async () => {
    await fan.goto('/')
    await expect(fan.getByText('Cae el lunes 17 de marzo')).toBeVisible()
    await fan.getByLabel('Tu email').fill(fanEmail)
    await fan.getByRole('button', { name: 'Avísame' }).click()
    await expect(fan.getByText(/Revisa tu email y confirma la alerta/)).toBeVisible()
    const token = (await lastMail(fan.request, fanEmail))?.text.match(/alerta\?token=([\w-]+)/)?.[1]
    expect(token).toBeTruthy()
    await fan.goto(`/alerta?token=${token}`)
    await fan.getByRole('button', { name: /Confirmar mi alerta/ }).click()
    await expect(fan.getByText(/Alerta confirmada/)).toBeFocused()
  })

  await test.step('la home cambia de semana sola en la frontera, y la revelación sale una vez', async () => {
    // El reloj del navegador, 30 s antes de la frontera: bajo carga, con menos margen, la cruzaría antes de
    // que el test cambie la hora de la API (y la home pediría la semana con la hora vieja).
    clock.api = W12.startsAt - 30_000
    await fan.clock.setSystemTime(W12.startsAt - 30_000)
    await fan.goto('/')
    await expect(fan.getByText('Cae el lunes 17 de marzo')).toBeVisible()
    // En la frontera, el navegador vuelve a pedir la semana; la API ya está en el lunes.
    clock.api = W12.startsAt + 2_000
    const refetch = fan.waitForResponse((res) => res.url().includes('/api/weeks/current'), {
      timeout: 30_000,
    })
    await fan.clock.runFor(35_000)
    await refetch
    const reveal = fan.getByRole('dialog', { name: /Nuevo escenario/ })
    await expect(reveal).toBeVisible({ timeout: 20_000 })
    await fan.keyboard.press('Escape')
    await expect(reveal).toBeHidden()
    await expect(fan.getByRole('article', { name: 'Lluvia de marzo' })).toBeVisible()
    await fan.reload()
    await expect(fan.getByRole('article', { name: 'Lluvia de marzo' })).toBeVisible()
    await fan.clock.runFor(1_000)
    await expect(fan.getByRole('dialog', { name: /Nuevo escenario/ })).toHaveCount(0)
  })

  await test.step('RF-DROP-06: la descarga exige aceptar las bases de la semana', async () => {
    clock.api = W12.startsAt + 3_600_000
    const producerContext = await clockedContext(browser, base, testIp(33), clock)
    const producer = await signUp(producerContext, base, producerEmail, `lilbru${run}f3`, clock.api)
    await producer.clock.install({ time: clock.api })
    await producer.goto(`/semana/${W12.slug}`)
    await expect(producer.getByRole('heading', { level: 1, name: 'Lluvia de marzo' })).toBeAttached()
    await expectNoAxeViolations(producer)
    await producer.getByRole('button', { name: 'Pillar el sample' }).click()
    const modal = producer.getByRole('dialog', { name: /Bases de la semana/ })
    await expect(modal).toBeVisible()
    await modal.getByRole('button', { name: 'Aceptar y descargar' }).click()
    await expect(modal.getByText('Marca que aceptas las bases para seguir.')).toBeVisible()
    await modal.getByRole('button', { name: /Acepto las bases/ }).click()
    const [download] = await Promise.all([
      producer.waitForEvent('download'),
      modal.getByRole('button', { name: 'Aceptar y descargar' }).click(),
    ])
    expect(download.suggestedFilename()).toMatch(/\.wav$/)
    await producerContext.close()
  })

  await test.step('RF-NOTIF-09: el tick del lunes a las 08:00 manda el drop, también al suscriptor sin cuenta', async () => {
    const tick = await fan.request.get('/api/cron/tick', {
      headers: { authorization: `Bearer ${CRON_SECRET}`, 'x-bb-test-now': String(DROP_MAIL_AT) },
    })
    expect(tick.ok(), await tick.text()).toBe(true)
    const toFan = await lastMail(fan.request, fanEmail)
    expect(toFan?.subject).toBe('Nuevo drop: Lluvia de marzo · 92 BPM · Re menor')
    expect(toFan?.text).toContain('crea la tuya')
    const toProducer = await lastMail(fan.request, producerEmail)
    expect(toProducer?.subject).toBe('Nuevo drop: Lluvia de marzo · 92 BPM · Re menor')
    expect(toProducer?.text).not.toContain('crea la tuya')
  })

  await adminContext.close()
  await fanContext.close()
})

test('RF-DROP-10: con 59 min 59 s por delante, el reloj de ronda marca 00:00:59:59 en modo «última hora»', async ({
  browser,
  baseURL,
}) => {
  const now = W12.submitEndsAt - 3_599_000
  const clock = { api: now }
  const context = await clockedContext(browser, baseURL as string, testIp(34), clock)
  await context.addInitScript((slug) => window.localStorage.setItem(`bb:drop-seen:${slug}`, 'yes'), W12.slug)
  const page = await context.newPage()
  // Hora fija: el reloj de ronda se lee al segundo.
  await page.clock.setFixedTime(now)
  await page.goto('/')
  const timer = page.getByRole('banner').getByRole('timer')
  await expect(timer).toHaveAccessibleName(/cierre de envíos/i)
  await expect(timer).toContainText(/0\s+horas, 59\s+minutos y 59\s+segundos/)
  expect((await timer.locator('[aria-hidden="true"]').last().innerText()).replace(/\D/g, '')).toBe('00005959')
  await expect(page.locator('[data-phase="final"]').first()).toBeVisible()
  // Con 1 h y 1 s, sin «hora loca».
  clock.api = W12.submitEndsAt - 3_601_000
  await page.clock.setFixedTime(W12.submitEndsAt - 3_601_000)
  await page.reload()
  await expect(timer).toContainText(/1\s+hora, 0\s+minutos y 1\s+segundo(?!s)/)
  await expect(page.locator('[data-phase="final"]')).toHaveCount(0)
  await context.close()
})
