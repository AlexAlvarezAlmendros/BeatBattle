import { expect, test } from '@playwright/test'
import { battleContext, type Clock, createBattleWeek } from './battle'
import { runSuffix, testIp } from './support'

/**
 * El reproductor global (guía §2.6, §4.7.3; tarea 5.13): un único `<audio>` que sigue sonando al navegar
 * (`RF-PLAY-01`), con su barra encima de la barra de controles. La semana es la del 14 de marzo de 2033
 * (nada más en la BD de los E2E cae ahí).
 */

test.describe.configure({ mode: 'serial' })

test('RF-PLAY-01: el sample sigue sonando al navegar de la home a otra pantalla; la barra lo controla y se cierra', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000)
  const base = baseURL as string
  const clock: Clock = { api: 0 }
  await createBattleWeek(browser, base, {
    monday: '2033-03-14',
    producers: 1,
    run: runSuffix(),
    ip: testIp,
    clock,
  })
  const context = await battleContext(browser, base, testIp(40), clock)
  const page = await context.newPage()
  // El navegador, a la misma hora que la API (la fase de la semana también se calcula aquí).
  await page.clock.install({ time: clock.api })
  await page.goto('/')
  await page.getByRole('button', { name: 'Escuchar el sample «Lluvia en Gràcia»' }).click()
  // En la home, la tarjeta del escenario es el mando del sample: la barra no sale.
  await expect(page.getByRole('button', { name: 'Escuchar el sample «Lluvia en Gràcia»' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  const bar = page.getByRole('region', { name: 'Reproductor' })
  await expect(bar).toHaveCount(0)

  // A otra pantalla sin recargar (como un enlace de la app): sigue sonando y la barra aparece.
  await page.evaluate(() => {
    history.pushState({}, '', '/como-funciona')
    dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/c[oó]mo se juega/i)
  await expect(bar).toBeVisible()
  await expect(bar).toContainText('Lluvia en Gràcia')
  const time = bar.getByText(/\d:\d\d \/ \d:\d\d/)
  const first = await time.innerText()
  await expect.poll(async () => time.innerText(), { timeout: 10_000 }).not.toBe(first)
  // Pausa y cierre (si en una máquina lenta el sample ya ha acabado, el botón lo vuelve a poner).
  const toggle = bar.getByRole('button', { name: /^(Pausar|Escuchar) Lluvia en Gràcia$/ })
  const before = await toggle.getAttribute('aria-label')
  await toggle.click()
  await expect(toggle).not.toHaveAttribute('aria-label', before ?? '')
  await bar.getByRole('button', { name: 'Cerrar el reproductor' }).click()
  await expect(bar).toHaveCount(0)
  await context.close()
})
