import { expect, test } from '@playwright/test'
import {
  type Account,
  apiVote,
  battleContext,
  type Clock,
  createBattleWeek,
  PASSWORD,
  signUp,
  tickUntilMail,
} from './battle'
import { expectNoAxeViolations, runSuffix, testIp } from './support'

/**
 * E2E del hito de la Fase 6 (guía §5, tarea 6.21): una semana simulada se vota, se cierra y se sella; sale el
 * Lunes de batalla; los resultados, la oferta de la home y la ceremonia (saltada con Esc, y vista); la tarjeta
 * para stories; re-sellar sin cambios da el mismo snapshot y, tras descalificar, la revisión nueva con su aviso;
 * y el archivo. Las reglas una a una están en los tests del servidor (`results.test.ts`, `monday.test.ts`).
 *
 * La semana es la del 2 de mayo de 2033 y la siguiente, la del 9 (nada más en la BD de los E2E cae ahí).
 */

const CRON_SECRET = 'e2e-cron-secret-0123456789abcdefghij'
/** Lunes 9 de mayo de 2033 a las 08:00 en Madrid (UTC+2). */
const MONDAY_8 = Date.UTC(2033, 4, 9, 6, 0)

test.describe.configure({ mode: 'serial' })

/** Ancho y alto de un PNG (cabecera IHDR). */
function pngSize(buffer: Buffer): [number, number] {
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)]
}

test('hito de la Fase 6: se vota, se sella, Lunes de batalla, resultados, ceremonia, stories, re-sellado y archivo', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(300_000)
  const base = baseURL as string
  const clock: Clock = { api: 0 }
  const run = runSuffix()
  // La semana siguiente primero (su drop es el del Lunes de batalla); después, la que se juega.
  await createBattleWeek(browser, base, { monday: '2033-05-09', producers: 0, run, ip: testIp, clock })
  const week = await createBattleWeek(browser, base, {
    monday: '2033-05-02',
    producers: 4,
    run,
    ip: (slot) => testIp(slot + 20),
    clock,
  })
  const [first, second, third, fourth] = week.producers as [
    Account & { entryId: string; alias: string },
    Account & { entryId: string; alias: string },
    Account & { entryId: string; alias: string },
    Account & { entryId: string; alias: string },
  ]
  const headers = () => ({ origin: base, 'x-bb-test-now': String(clock.api) })

  await test.step('se vota: cada productor puntúa las otras tres (5, 4, 3 y 2 para cada puesto)', async () => {
    const stars = new Map([
      [first.entryId, 5],
      [second.entryId, 4],
      [third.entryId, 3],
      [fourth.entryId, 2],
    ])
    for (const voter of week.producers)
      for (const target of week.producers)
        if (target !== voter)
          await apiVote(voter, target.entryId, stars.get(target.entryId) ?? 3, clock, base)
    // Sin sellar, no hay resultados (`RF-PLAY-05`).
    const early = await first.page.request.get(`/api/weeks/${week.slug}/results`, { headers: headers() })
    expect(early.status()).toBe(404)
  })

  await test.step('RF-NOTIF-07: el lunes a las 08:00 el tick sella y sale el Lunes de batalla combinado', async () => {
    clock.api = MONDAY_8
    const tick = await first.page.request.get('/api/cron/tick', {
      headers: { authorization: `Bearer ${CRON_SECRET}`, 'x-bb-test-now': String(clock.api) },
    })
    expect(tick.ok(), await tick.text()).toBe(true)
    const body = (await tick.json()).data
    expect(body.sealed).toContain(week.slug)
    expect(body.mondayEmails.monday).toBeGreaterThanOrEqual(4)
    const mail = await tickUntilMail(first.page.request, clock.api, first.email, 'Nuevo drop')
    expect(mail?.subject).toMatch(/^1\.º en la #\d+ · Nuevo drop: /)
    expect(mail?.text).toContain('Ver la ceremonia')
    const other = await tickUntilMail(second.page.request, clock.api, second.email, 'Nuevo drop')
    expect(other?.subject).toMatch(/^2\.º en la #\d+ · Nuevo drop: /)
  })

  await test.step('RF-RES-09: la home ofrece la ceremonia; se ve, se salta con Esc y queda vista', async () => {
    // Un contexto en el que la home sí ofrece la ceremonia (los de batalla la dan por vista).
    const context = await battleContext(browser, base, testIp(41), clock, { ceremonyOffer: true })
    const page = await context.newPage()
    const signedIn = await page.request.post('/api/auth/sign-in/email', {
      headers: { origin: base, 'x-bb-test-now': String(clock.api) },
      data: { email: third.email, password: PASSWORD },
    })
    expect(signedIn.ok(), await signedIn.text()).toBe(true)
    await page.goto('/')
    const offer = page.getByRole('dialog', { name: /sellada/ })
    await expect(offer).toBeVisible({ timeout: 20_000 })
    await offer.getByRole('button', { name: /Ver la ceremonia/ }).click()
    await expect(page).toHaveURL(new RegExp(`/semana/${week.slug}/resultados\\?ceremonia`))
    const ceremony = page.getByRole('dialog', { name: /Ceremonia de resultados/ })
    await expect(ceremony).toBeVisible()
    await expect(ceremony.getByText('¡Sellado!')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(ceremony).toBeHidden()
    await expect(page).toHaveURL(new RegExp(`/semana/${week.slug}/resultados$`))
    await expect
      .poll(async () => {
        const res = await page.request.get('/api/weeks/current', { headers: headers() })
        return (await res.json()).data.sealed?.ceremonySeen
      })
      .toBe(true)
    // Vista, la home ya no la ofrece.
    await page.goto('/')
    await expect(page.getByRole('menuitem', { name: /Resultados/ }).first()).toBeVisible()
    await expect(page.getByRole('dialog', { name: /sellada/ })).toHaveCount(0)
    await context.close()
  })

  await test.step('RF-RES-07 / RF-RES-08: la página de resultados revela al productor, el podio y «tu resultado»', async () => {
    const page = second.page
    await page.goto(`/semana/${week.slug}/resultados`)
    const podium = page.getByRole('region', { name: 'Podio' })
    await expect(podium).toBeVisible()
    await expect(podium.getByRole('link', { name: first.username })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Tu resultado' })).toContainText('2.º')
    await expect(page.getByRole('heading', { name: 'Clasificación completa' })).toBeAttached()
    await expectNoAxeViolations(page)
  })

  await test.step('RF-SHARE-03: la tarjeta para stories se descarga como un PNG de 1080 × 1920', async () => {
    const page = second.page
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Tarjeta para stories' }).click()
    const path = await (await download).path()
    const { readFileSync } = await import('node:fs')
    expect(pngSize(readFileSync(path))).toEqual([1080, 1920])
  })

  await test.step('RF-RES-06: re-sellar sin cambios da el mismo snapshot; tras descalificar, la revisión nueva con su aviso', async () => {
    const context = await battleContext(browser, base, testIp(40), clock)
    const admin = await signUp(
      context,
      base,
      `jefa${run}.f6@example.com`,
      `jefa${run}f6`,
      testIp(40),
      clock.api,
    )
    const role = await admin.page.request.post('/api/test/role', {
      headers: headers(),
      data: { email: admin.email, role: 'admin' },
    })
    expect(role.ok(), await role.text()).toBe(true)
    const rows = async () => {
      const res = await admin.page.request.get(`/api/weeks/${week.slug}/results`, { headers: headers() })
      return (await res.json()).data as {
        week: { revision: number; correctedAt: number | null }
        rows: { entry: { id: string }; result: { position: number | null } }[]
      }
    }
    const before = await rows()
    const same = await admin.page.request.post(`/api/admin/weeks/${week.slug}/reseal`, { headers: headers() })
    expect(same.ok(), await same.text()).toBe(true)
    const after = await rows()
    expect(after.week.revision).toBe(before.week.revision + 1)
    expect(after.rows.map((row) => [row.entry.id, row.result.position])).toEqual(
      before.rows.map((row) => [row.entry.id, row.result.position]),
    )
    const dq = await admin.page.request.post(`/api/admin/entries/${first.entryId}/disqualify`, {
      headers: headers(),
      data: { reason: 'rights' },
    })
    expect(dq.status()).toBe(204)
    clock.api += 60_000
    const resealed = await admin.page.request.post(`/api/admin/weeks/${week.slug}/reseal`, {
      headers: headers(),
    })
    expect(resealed.ok(), await resealed.text()).toBe(true)
    const corrected = await rows()
    expect(corrected.rows.find((row) => row.entry.id === second.entryId)?.result.position).toBe(1)
    expect(corrected.rows.some((row) => row.entry.id === first.entryId)).toBe(false)
    const page = second.page
    await page.goto(`/semana/${week.slug}/resultados`)
    await expect(page.getByRole('note')).toContainText('Clasificación corregida')
    await expect(page.getByRole('region', { name: 'Tu resultado' })).toContainText('1.º')
    await context.close()
  })

  await test.step('RF-ARC-01: el archivo lleva la semana con su podio y enlaza sus resultados', async () => {
    const page = fourth.page
    await page.goto('/semanas')
    const card = page.getByRole('heading', { name: /Semana \d+/ }).first()
    await expect(card).toBeVisible()
    await expect(page.getByRole('link', { name: second.username, exact: false }).first()).toBeVisible()
  })
})
