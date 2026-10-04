import { expect, test } from '@playwright/test'
import { collectErrors } from './support'

/**
 * Humo de la home (tarea 0.13, guía §4.16): el marco del sello (isla, titular, pie) se pinta sin
 * errores y la API responde por el proxy de Vite en el mismo origen, como en producción.
 */

test('humo: la home pinta la isla, el titular «Beat Battle» y el pie, sin errores', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/')

  await expect(page).toHaveTitle('Beat Battle · Other People')

  // Isla de navegación: logo del sello, enlaces principales y «Entrar».
  const island = page.getByRole('banner')
  await expect(island).toBeVisible()
  await expect(island.getByRole('link', { name: 'Other People Records' })).toHaveAttribute(
    'href',
    'https://www.otherpeople.es/',
  )
  const nav = island.getByRole('navigation', { name: 'Principal' })
  for (const name of ['Semana', 'Jurado', 'Resultados', 'Salón de la fama', 'Cómo funciona'])
    await expect(nav.getByRole('link', { name, exact: true })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Semana', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(island.getByRole('link', { name: 'Entrar', exact: true })).toBeVisible()

  // Titular del hero y estado «calendario vacío» (§2.19).
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { level: 1, name: 'Beat Battle' })).toBeVisible()
  await expect(main.getByText('El próximo drop está en el horno.')).toBeVisible()
  await expect(main.getByRole('link', { name: 'Avísame del próximo drop' })).toHaveAttribute(
    'href',
    '/#alerta',
  )
  await expect(page.getByRole('marquee', { name: 'Teletipo de la batalla' })).toBeVisible()

  // Pie del sello con sus enlaces (RF-OTP-01) y los legales.
  const footer = page.getByRole('contentinfo')
  await expect(footer.getByRole('heading', { name: 'Beat Battle', exact: true })).toBeVisible()
  await expect(footer.getByRole('navigation', { name: 'Web de Other People Records' })).toBeVisible()
  await expect(footer.getByRole('link', { name: /^Beats/ })).toHaveAttribute(
    'href',
    'https://www.otherpeople.es/beats',
  )
  await expect(footer.getByRole('navigation', { name: 'Legal' }).getByRole('link')).toHaveCount(4)

  expect(errors).toEqual([])
})

test('§2.12.3: el CTA «Avísame del próximo drop» lleva a su sección de la home, a la vista bajo la isla', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await page.goto('/')
  const main = page.getByRole('main')
  await main.getByRole('link', { name: 'Avísame del próximo drop' }).click()
  await expect(page).toHaveURL('/#alerta')
  const section = main.getByRole('region', { name: 'Avísame del próximo drop' })
  await expect(section).toHaveAttribute('id', 'alerta')
  const heading = section.getByRole('heading', { level: 2, name: 'Avísame del próximo drop' })
  await expect(heading).toBeInViewport()
  // El título no queda bajo la isla ni bajo el logo que cuelga de ella (`--nav-obscured`).
  await expect.poll(async () => (await heading.boundingBox())?.y ?? 0).toBeGreaterThanOrEqual(119)
  expect(errors).toEqual([])
})

test('humo: /api/health responde por el proxy de Vite con el sobre { data }', async ({ request }) => {
  const res = await request.get('/api/health')
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('application/json')
  const body = await res.json()
  expect(body).toEqual({ data: { status: 'ok', db: 'up', time: expect.any(Number) } })
})

test('humo: el reloj de prueba de los E2E llega a la API a través del proxy (x-bb-test-now)', async ({
  request,
}) => {
  const now = Date.UTC(2026, 9, 5, 10, 0, 0)
  const res = await request.get('/api/health', { headers: { 'x-bb-test-now': String(now) } })
  expect(res.status()).toBe(200)
  expect((await res.json()).data.time).toBe(now)
})
