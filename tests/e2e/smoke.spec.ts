import { expect, test } from '@playwright/test'
import { collectErrors } from './support'

/**
 * Humo de la home (tareas 0.13 y 0.27, guía §3.4.1 y §3.8.3): el marco de juego (HUD, barra de
 * controles con la firma) y el menú principal en «calendario vacío» se pintan sin errores, y la API
 * responde por el proxy de Vite en el mismo origen, como en producción.
 */

test('humo: la home pinta el HUD, el menú principal y la barra de controles, sin errores', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await page.goto('/')
  await expect(page).toHaveTitle('Beat Battle · Other People')

  // HUD: sin sesión, «1P · PULSA PARA UNIRTE» lleva a entrar; el botón de sonido es un conmutador.
  const hud = page.getByRole('banner')
  await expect(hud.getByRole('link', { name: /Pulsa para unirte/ })).toHaveAttribute('href', '/entrar')
  await expect(hud.getByRole('button', { name: 'Sonido de efectos (M)' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  // Menú principal (§3.8.3) en «calendario vacío» (§2.19).
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { level: 1, name: 'Beat Battle' })).toBeAttached()
  await expect(main.getByRole('heading', { level: 2, name: 'En el horno' })).toBeVisible()
  const menu = main.getByRole('menu', { name: 'Elige modo' })
  await expect(menu.getByRole('menuitem')).toHaveCount(6)
  await expect(main.getByRole('region', { name: /Avísame del próximo drop/ })).toHaveAttribute('id', 'alerta')

  // Barra de controles con sus teclas y la firma del sello (RF-OTP-01).
  const bar = page.getByRole('contentinfo')
  await expect(bar.getByRole('list', { name: 'Controles' }).getByRole('listitem')).toHaveCount(4)
  await expect(
    bar.getByRole('link', {
      name: 'Un juego de Other People Records (abre la web del sello en una pestaña nueva)',
    }),
  ).toHaveAttribute('href', 'https://www.otherpeople.es/')

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
