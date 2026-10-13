import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type APIRequestContext, type Browser, expect, type Page, test } from '@playwright/test'
import { expectNoAxeViolations, runSuffix, testIp } from './support'

/**
 * E2E del hito de la Fase 4 (guía §5, tarea 4.19): un WAV de 60 MB (140 BPM en La menor) sube por trozos
 * desde `/subir`; el análisis local sugiere 140 y `Am` (`RF-ENT-06`); el servidor verifica y mide la
 * sonoridad (`RF-STO-04`, `RF-ENT-05`) y el `tick` manda `entry.receipt` con el número de recibo, el
 * informe técnico y la huella (`RF-NOTIF-06`). Después, el menú dice «Editar mi entrada» (`RF-ENT-01`).
 *
 * El almacenamiento es el falso (`BB_FAKE_STORAGE`) y el email, el `Mailer` en memoria. El reloj, como en
 * `weeks.spec.ts`: `page.clock` en el navegador y `x-bb-test-now` en cada `/api`. La semana es la del 15 de
 * marzo de 2032 (nada más en la BD de los E2E cae ahí).
 */

const PASSWORD = 'lluvia en gràcia 92'
const CRON_SECRET = 'e2e-cron-secret-0123456789abcdefghij'
const MONDAY = '2032-03-15'
const SLUG = '2032-w12'

test.describe.configure({ mode: 'serial' })

/** Cabecera de un WAV PCM. */
function wavHeader(dataBytes: number, rate: number, channels: number, bits: number): Buffer {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataBytes, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(rate, 24)
  header.writeUInt32LE((rate * channels * bits) / 8, 28)
  header.writeUInt16LE((channels * bits) / 8, 32)
  header.writeUInt16LE(bits, 34)
  header.write('data', 36)
  header.writeUInt32LE(dataBytes, 40)
  return header
}

/**
 * El beat del hito: 104 s a 96 kHz, estéreo y 24 bits (≈ 60 MB), con un bombo a 140 BPM y un acorde de
 * La menor. Pasa los límites (≤ 100 MB, 30 s – 4 min) y sube en 3 trozos de 20 MB.
 */
function hitBeat(): Buffer {
  const rate = 96_000
  const seconds = 104
  const frames = rate * seconds
  const data = Buffer.alloc(frames * 2 * 3)
  const beat = Math.round((60 / 140) * rate)
  const chord = [220, 261.63, 329.63]
  for (let i = 0; i < frames; i++) {
    const since = i % beat
    const kick =
      since < rate * 0.12
        ? Math.sin(2 * Math.PI * (60 - since / 400) * (since / rate)) * Math.exp(-since / (rate * 0.04))
        : 0
    const pad = chord.reduce((sum, f) => sum + Math.sin((2 * Math.PI * f * i) / rate), 0) / chord.length
    const value = Math.round(Math.max(-1, Math.min(1, 0.6 * kick + 0.25 * pad)) * 8_388_607)
    data.writeIntLE(value, i * 6, 3)
    data.writeIntLE(value, i * 6 + 3, 3)
  }
  return Buffer.concat([wavHeader(data.length, rate, 2, 24), data])
}

/** Un sample mínimo para la semana (6 s de acorde y la cabecera de una portada de 1200 px). */
function sampleFiles() {
  const rate = 22_050
  const frames = rate * 6
  const data = Buffer.alloc(frames * 2)
  for (let i = 0; i < frames; i++)
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 0.4 * 32767), i * 2)
  const png = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0)
  png.writeUInt32BE(13, 8)
  png.write('IHDR', 12)
  png.writeUInt32BE(1200, 16)
  png.writeUInt32BE(1200, 20)
  return { wav: Buffer.concat([wavHeader(data.length, rate, 1, 16), data]), png }
}

async function clockedContext(browser: Browser, baseURL: string, ip: string, clock: { api: number }) {
  const context = await browser.newContext({ baseURL, extraHTTPHeaders: { 'x-forwarded-for': ip } })
  await context.addInitScript(() => {
    window.sessionStorage.setItem('bb:title-seen', 'yes')
    window.localStorage.setItem('bb:drop-seen:2032-w12', 'yes')
  })
  await context.route('**/api/**', (route) =>
    route.continue({ headers: { ...route.request().headers(), 'x-bb-test-now': String(clock.api) } }),
  )
  return context
}

async function lastMail(request: APIRequestContext, email: string, contains?: string) {
  const query = `to=${encodeURIComponent(email)}${contains ? `&contains=${encodeURIComponent(contains)}` : ''}`
  const mailbox = await (await request.get(`/api/test/mailbox?${query}`)).json()
  return mailbox.data as { subject: string; text: string; html: string } | null
}

async function signUp(page: Page, baseURL: string, email: string, username: string, now: number) {
  const res = await page.request.post('/api/auth/sign-up/email', {
    headers: { origin: baseURL, 'x-bb-test-now': String(now) },
    data: { email, password: PASSWORD, name: username, username, callbackURL: '/' },
  })
  expect(res.ok(), await res.text()).toBe(true)
  const link = (await lastMail(page.request, email))?.text.match(/https?:\/\/\S+verify-email\?\S+/)?.[0]
  if (!link) throw new Error(`sin enlace de verificación para ${email}`)
  await page.request.get(link)
}

test('hito de la Fase 4: un WAV de 60 MB por trozos, BPM y tonalidad sugeridos, sonoridad medida y recibo', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(240_000)
  const base = baseURL as string
  const run = runSuffix()
  const before = Date.UTC(2032, 2, 12, 12, 0, 0)
  const clock = { api: before }
  const adminEmail = `jefa.f4.${run}@example.com`
  const producerEmail = `lilbru.f4.${run}@example.com`

  // ── La semana del 15 de marzo de 2032, con su sample ──────────────────────────────────────────────────
  const adminContext = await clockedContext(browser, base, testIp(41), clock)
  const admin = await adminContext.newPage()
  await signUp(admin, base, adminEmail, `jefa${run}f4`, before)
  await admin.request.post('/api/test/role', {
    headers: { origin: base },
    data: { email: adminEmail, role: 'admin' },
  })
  const headers = { origin: base, 'x-bb-test-now': String(before) }
  const files = sampleFiles()
  let sampleId: string | undefined
  for (const [part, name, buffer, mimeType] of [
    ['original', 'sample.wav', files.wav, 'audio/wav'],
    ['cover', 'cover.png', files.png, 'image/png'],
  ] as const) {
    const signed = await admin.request.post('/api/admin/samples/sign', {
      headers,
      data: sampleId ? { part, sampleId } : { part },
    })
    const { data } = await signed.json()
    sampleId = data.sampleId
    const upload = await admin.request.post(data.upload.uploadUrl, {
      headers: { origin: base },
      multipart: { ...data.upload.fields, file: { name, mimeType, buffer } },
    })
    expect(upload.ok(), await upload.text()).toBe(true)
  }
  const sample = await admin.request.post('/api/admin/samples', {
    headers,
    data: {
      sampleId,
      title: 'Lluvia de 2032',
      credits: 'E2E',
      licenseText: 'Uso libre.',
      bpm: 92,
      musicalKey: 'Dm',
    },
  })
  expect(sample.ok(), await sample.text()).toBe(true)
  const scheduled = await admin.request.post('/api/admin/weeks', {
    headers,
    data: { monday: MONDAY, sampleId },
  })
  expect(scheduled.ok(), await scheduled.text()).toBe(true)
  const week = (await scheduled.json()).data as { startsAt: number; slug: string }
  expect(week.slug).toBe(SLUG)

  // ── El productor, con la semana abierta (martes a mediodía) ─────────────────────────────────────────
  const tuesday = week.startsAt + 36 * 3_600_000
  clock.api = tuesday
  const context = await clockedContext(browser, base, testIp(42), clock)
  const page = await context.newPage()
  await signUp(page, base, producerEmail, `lilbru${run}f4`, tuesday)
  await page.clock.install({ time: tuesday })
  const chunks: string[] = []
  page.on('request', (request) => {
    const range = request.headers()['content-range']
    if (request.url().includes('/api/test/storage/upload') && range) chunks.push(range)
  })

  await page.goto('/subir')
  await page.getByRole('button', { name: 'Leer las bases' }).click()
  await page.getByText(/Acepto las bases/).click()
  await page.getByRole('button', { name: /Aceptar las bases/ }).click()
  await expect(page.getByRole('region', { name: 'Inserta tu beat' })).toBeVisible()
  await expectNoAxeViolations(page)

  await test.step('RF-ENT-06: el análisis local sugiere 140 BPM y La menor', async () => {
    // Playwright no pasa búferes de más de 50 MB: el WAV va a un fichero temporal.
    const wavPath = join(tmpdir(), `bb-e2e-flip-${run}.wav`)
    writeFileSync(wavPath, hitBeat())
    await page.locator('input[type="file"][accept*="wav"]').setInputFiles(wavPath)
    await expect(page.getByText('BPM y tonalidad sugeridos')).toBeVisible({ timeout: 90_000 })
    await expect(page.getByLabel('BPM')).toHaveValue('140')
    await expect(page.getByLabel('Tonalidad')).toHaveValue('Am')
  })

  await test.step('RF-STO-01 / RF-ENT-12: la ficha y la subida por trozos de 20 MB', async () => {
    await page.getByLabel('Título').fill('Bruma de marzo')
    await page.getByRole('button', { name: /Trap/ }).first().click()
    await page.getByRole('button', { name: /He usado el sample/ }).click()
    await page.getByRole('button', { name: /Entrar en la batalla/ }).click()
    await expect(page.getByText(/Ya estás en la batalla #/)).toBeVisible({ timeout: 120_000 })
    expect(chunks).toHaveLength(3)
    const total = Number(chunks[0]?.split('/')[1])
    expect(total).toBeGreaterThan(55 * 1024 * 1024)
    expect(chunks.at(-1)).toMatch(new RegExp(`-${total - 1}/${total}$`))
    await expect(page.getByText(/Así te verán hasta el domingo/)).toBeVisible()
  })

  await test.step('RF-NOTIF-06: el tick manda el recibo con el número, la sonoridad medida y la huella', async () => {
    const tick = await page.request.get('/api/cron/tick', {
      headers: { authorization: `Bearer ${CRON_SECRET}`, 'x-bb-test-now': String(tuesday + 60_000) },
    })
    expect(tick.ok(), await tick.text()).toBe(true)
    const receipt = await lastMail(page.request, producerEmail, 'BB-2032W12-')
    expect(receipt?.subject).toMatch(/BB-2032W12-\d{4}/)
    expect(receipt?.text).toMatch(/LUFS/)
    expect(receipt?.text).toMatch(/1:44/)
    expect(receipt?.text).toMatch(/[0-9a-f]{8}/)
    // RF-ENT-05: la duración es la medida (104 s), no la que declaró el navegador.
  })

  await test.step('RF-ENT-01: el menú pasa a «Editar mi entrada»', async () => {
    await page.goto('/')
    await expect(page.getByRole('menuitem', { name: /Jugar/ })).toContainText('Editar mi entrada')
  })
  await context.close()
  await adminContext.close()
})
