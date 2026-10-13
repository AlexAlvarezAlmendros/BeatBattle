import { type Browser, type BrowserContext, expect, type Page } from '@playwright/test'

/**
 * Una semana en juego con entradas, para los E2E de la Fase 5 (tarea 5.20): el admin sube el sample y
 * programa la semana del lunes `monday`; cada productor se registra (con su IP: el alta admite 3 por hora y
 * por IP), acepta las bases, firma su entrada, la sube al almacenamiento falso y la registra. Todo por la
 * API, con el reloj de la API en `clock.api` (`x-bb-test-now`) en cada petición a `/api` del contexto.
 */

export const PASSWORD = 'lluvia en gràcia 92'

export interface Clock {
  api: number
}

export interface Account {
  email: string
  username: string
  page: Page
}

export interface BattleWeek {
  slug: string
  startsAt: number
  submitEndsAt: number
  voteEndsAt: number
  producers: (Account & { entryId: string; alias: string })[]
}

function wav(seconds: number, frequency: number): Buffer {
  const rate = 8000
  const frames = rate * seconds
  const buffer = Buffer.alloc(44 + frames * 2)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + frames * 2, 4)
  buffer.write('WAVEfmt ', 8)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(rate, 24)
  buffer.writeUInt32LE(rate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(frames * 2, 40)
  for (let i = 0; i < frames; i++) {
    const beat = (i % (rate / 2)) / rate
    const value = Math.sin((2 * Math.PI * frequency * i) / rate) * (0.2 + 0.4 * Math.exp(-beat * 6))
    buffer.writeInt16LE(Math.round(value * 32767), 44 + i * 2)
  }
  return buffer
}

function pngHeader(): Buffer {
  const png = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0)
  png.writeUInt32BE(13, 8)
  png.write('IHDR', 12)
  png.writeUInt32BE(1200, 16)
  png.writeUInt32BE(1200, 20)
  return png
}

/** Un contexto con el reloj de la API, sin la pantalla de título ni la revelación del drop. */
export async function battleContext(
  browser: Browser,
  baseURL: string,
  ip: string,
  clock: Clock,
  options: { viewport?: { width: number; height: number }; touch?: boolean } = {},
): Promise<BrowserContext> {
  const context = await browser.newContext({
    baseURL,
    extraHTTPHeaders: { 'x-forwarded-for': ip },
    ...(options.viewport ? { viewport: options.viewport } : {}),
    ...(options.touch ? { isMobile: true, hasTouch: true } : {}),
  })
  await context.addInitScript(() => {
    window.sessionStorage.setItem('bb:title-seen', 'yes')
    // La revelación del drop sale la primera vez de cada semana: aquí se da por vista.
    const getItem = Storage.prototype.getItem
    Storage.prototype.getItem = function (key: string) {
      return key.startsWith('bb:drop-seen:') ? 'yes' : getItem.call(this, key)
    }
  })
  // El reloj de la API en cada petición del navegador (las de `page.request` lo llevan explícito).
  await context.route('**/api/**', (route) => {
    const headers = route.request().headers()
    return route.continue({
      headers: { ...headers, 'x-bb-test-now': headers['x-bb-test-now'] ?? String(clock.api) },
    })
  })
  return context
}

/** Una cuenta verificada (registro por la API y el enlace del buzón de prueba), con su página. */
export async function signUp(
  context: BrowserContext,
  baseURL: string,
  email: string,
  username: string,
  ip: string,
  now: number,
): Promise<Account> {
  const page = await context.newPage()
  const res = await page.request.post('/api/auth/sign-up/email', {
    headers: { origin: baseURL, 'x-forwarded-for': ip, 'x-bb-test-now': String(now) },
    data: { email, password: PASSWORD, name: username, username, callbackURL: '/' },
  })
  expect(res.ok(), await res.text()).toBe(true)
  const mailbox = await (await page.request.get(`/api/test/mailbox?to=${encodeURIComponent(email)}`)).json()
  const link = (mailbox.data?.text as string | undefined)?.match(/https?:\/\/\S+verify-email\?\S+/)?.[0]
  if (!link) throw new Error(`sin enlace de verificación para ${email}`)
  await page.request.get(link, { headers: { 'x-bb-test-now': String(now) } })
  return { email, username, page }
}

/**
 * Crea la semana del lunes `monday` (`AAAA-MM-DD`, con su sample) y `producers` entradas, cada una de una
 * cuenta en su propio contexto. Deja `clock.api` una hora después del drop.
 */
export async function createBattleWeek(
  browser: Browser,
  baseURL: string,
  {
    monday,
    producers,
    run,
    ip,
    clock,
  }: { monday: string; producers: number; run: string; ip: (slot: number) => string; clock: Clock },
): Promise<BattleWeek> {
  const [year, month, day] = monday.split('-').map(Number) as [number, number, number]
  clock.api = Date.UTC(year, month - 1, day - 3, 12)
  const adminContext = await battleContext(browser, baseURL, ip(1), clock)
  const admin = await signUp(
    adminContext,
    baseURL,
    `jefa${run}.${monday}@example.com`,
    `jefa${run}${day}`,
    ip(1),
    clock.api,
  )
  const headers = () => ({ origin: baseURL, 'x-bb-test-now': String(clock.api) })
  const role = await admin.page.request.post('/api/test/role', {
    headers: headers(),
    data: { email: admin.email, role: 'admin' },
  })
  expect(role.ok(), await role.text()).toBe(true)
  let sampleId: string | undefined
  for (const [part, name, buffer, mimeType] of [
    ['original', 'sample.wav', wav(20, 220), 'audio/wav'],
    ['cover', 'cover.png', pngHeader(), 'image/png'],
  ] as const) {
    const signed = await admin.page.request.post('/api/admin/samples/sign', {
      headers: headers(),
      data: sampleId ? { part, sampleId } : { part },
    })
    expect(signed.ok(), await signed.text()).toBe(true)
    const { data } = await signed.json()
    sampleId = data.sampleId
    const upload = await admin.page.request.post(data.upload.uploadUrl, {
      headers: headers(),
      multipart: { ...data.upload.fields, file: { name, mimeType, buffer } },
    })
    expect(upload.ok(), await upload.text()).toBe(true)
  }
  const sample = await admin.page.request.post('/api/admin/samples', {
    headers: headers(),
    data: {
      sampleId,
      title: 'Lluvia en Gràcia',
      credits: 'E2E',
      licenseText: 'Uso libre.',
      bpm: 92,
      musicalKey: 'Dm',
    },
  })
  expect(sample.ok(), await sample.text()).toBe(true)
  // Un reintento del mismo E2E ya tiene su semana: la siguiente libre (el reloj sigue antes de su lunes).
  const sampleId_ = (await sample.json()).data.id
  let created = await admin.page.request.post('/api/admin/weeks', {
    headers: headers(),
    data: { monday, sampleId: sampleId_ },
  })
  for (let weeks = 1; weeks <= 4 && created.status() === 409; weeks++) {
    const next = new Date(Date.UTC(year, month - 1, day + 7 * weeks)).toISOString().slice(0, 10)
    created = await admin.page.request.post('/api/admin/weeks', {
      headers: headers(),
      data: { monday: next, sampleId: sampleId_ },
    })
  }
  expect(created.ok(), await created.text()).toBe(true)
  const week = (await created.json()).data as {
    slug: string
    startsAt: number
    submitEndsAt: number
    voteEndsAt: number
  }
  await adminContext.close()
  clock.api = week.startsAt + 3_600_000

  const out: BattleWeek['producers'] = []
  for (let i = 0; i < producers; i++) {
    const slot = 10 + i
    const context = await battleContext(browser, baseURL, ip(slot), clock)
    const who = await signUp(
      context,
      baseURL,
      `prod${run}.${i}.${monday}@example.com`,
      `prod${run}${day}x${i}`,
      ip(slot),
      clock.api,
    )
    const rules = await who.page.request.post(`/api/weeks/${week.slug}/rules`, {
      headers: headers(),
      data: { rulesVersion: 1 },
    })
    expect(rules.ok(), await rules.text()).toBe(true)
    const audio = wav(31 + i, 180 + i * 40)
    const signed = await who.page.request.post('/api/uploads/sign', {
      headers: headers(),
      data: {
        kind: 'entry',
        weekSlug: week.slug,
        mime: 'audio/wav',
        bytes: audio.length,
        durationMs: (31 + i) * 1000,
      },
    })
    expect(signed.ok(), await signed.text()).toBe(true)
    const { data } = await signed.json()
    const upload = await who.page.request.post(data.uploadUrl, {
      headers: headers(),
      multipart: { ...data.fields, file: { name: 'beat.wav', mimeType: 'audio/wav', buffer: audio } },
    })
    expect(upload.ok(), await upload.text()).toBe(true)
    const entry = await who.page.request.post(`/api/weeks/${week.slug}/entries`, {
      headers: headers(),
      data: {
        intentId: data.intentId,
        title: `Flip ${i + 1}`,
        bpm: 90 + i,
        musicalKey: 'Am',
        daw: 'FL Studio',
        genres: ['Trap'],
        description: null,
        declaration: true,
      },
    })
    expect(entry.ok(), await entry.text()).toBe(true)
    const body = (await entry.json()).data as { id: string; alias: string }
    out.push({ ...who, entryId: body.id, alias: body.alias })
    clock.api += 60_000
  }
  return { ...week, producers: out }
}

/** Voto por la API (escucha, reloj +31 s, recibo y voto), para llegar a 5 votos sin pantallas. */
export async function apiVote(voter: Account, entryId: string, stars: number, clock: Clock, base: string) {
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

export async function lastMail(page: Page, email: string, contains: string) {
  const res = await page.request.get(
    `/api/test/mailbox?to=${encodeURIComponent(email)}&contains=${encodeURIComponent(contains)}`,
  )
  return (await res.json()).data as { subject: string; text: string } | null
}
