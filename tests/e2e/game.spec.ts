import { type BrowserContext, expect, type Page, test } from '@playwright/test'
import { type Account, apiVote, type Clock, createBattleWeek } from './battle'
import { expectNoAxeViolations, runSuffix, testIp } from './support'

/**
 * La capa de juego en pantalla (tareas 7.18–7.21; guía §3.4.1, §3.4.2, §3.8.7, §3.8.8): con una semana de verdad
 * (la API local, el almacenamiento falso y el reloj de prueba), el HUD enseña el XP y las teselas de `me`, lo pendiente
 * sale una vez (recargar no lo repite, `RF-GAME-09`), votar en la ficha lanza «+5 XP» que sube el medidor
 * (`RF-GAME-08`) con el aviso de su logro y la subida de nivel, y el Modo Jurado acaba en «¡JURADO COMPLETO!» con su
 * logro. Las capturas de la evidencia (`docs/planning/evidence/f7/hud/7.21-e2e-*`) salen de esta prueba.
 *
 * Ojo: con el reloj falso de Playwright, `performance.now()` se adelanta al reloj del documento y las animaciones WAAPI de
 * Motion (los avisos) empiezan tarde; por eso aquí se comprueba el DOM y no lo que se ve. Lo que se ve, en el banco
 * `/dev/recompensas`.
 *
 * La semana es la del 6 de junio de 2033 (nada más en la BD de los E2E cae ahí).
 */

/** Las capturas van a la salida de la prueba (las de la evidencia se copiaron de una pasada a mano). */
const shot = (name: string) => test.info().outputPath(name)

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

/** El medidor de XP del HUD. */
const xpMeter = (page: Page) => page.getByRole('banner').getByRole('meter', { name: 'Experiencia' })

test('capa de juego: HUD de me, avisos una vez, «+5 XP» al votar y «¡JURADO COMPLETO!» con su logro', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(300_000)
  const base = baseURL as string
  const clock: Clock = { api: 0 }
  const week = await createBattleWeek(browser, base, {
    monday: '2033-06-06',
    producers: 6,
    run: runSuffix(),
    ip: testIp,
    clock,
  })
  const [ana, bea, ...others] = week.producers as [
    Account & { entryId: string; alias: string },
    Account & { entryId: string; alias: string },
    ...(Account & { entryId: string; alias: string })[],
  ]
  const page = bea.page
  await fastAudio(page.context())
  bumpClockOnListen(page, clock)
  await page.clock.install({ time: clock.api })

  await test.step('RF-GAME-08: el HUD enseña el XP de `me` y las teselas; el logro sin ver sale una vez', async () => {
    // Bea subió la segunda: 100 XP de subir y 25 de «Primera piedra», sin ver.
    await page.goto('/')
    await expect(xpMeter(page)).toHaveAttribute('aria-valuenow', '125')
    const banner = page.getByRole('banner')
    await expect(banner.getByText('Racha', { exact: true })).toBeVisible()
    await expect(banner.getByText('×0')).toBeVisible()
    const plate = page.locator('[data-notice="achievement"]')
    await expect(plate).toContainText('Primera piedra')
    await expect(plate).toContainText('Común')
    // La captura en cuanto sale (dura 4 s), antes de la auditoría.
    await page.waitForTimeout(400)
    await page.screenshot({ path: shot('7.21-e2e-home-logro-1440x900.png') })
    await expectNoAxeViolations(page)
    // RF-GAME-09: recargar no lo repite (se marcó visto al salir).
    await page.waitForTimeout(500)
    await page.reload()
    await expect(xpMeter(page)).toHaveAttribute('aria-valuenow', '125')
    await page.waitForTimeout(1500)
    await expect(page.locator('[data-notice]')).toHaveCount(0)
  })

  await test.step('RF-GAME-08 / RF-GAME-09: votar en la ficha lanza «+5 XP», el medidor sube, su logro y el nivel, una vez', async () => {
    await page.goto(`/e/${ana.entryId}`)
    await page.getByRole('button', { name: /^Escuchar / }).click()
    const stars = page.getByRole('radiogroup', { name: new RegExp(ana.alias) })
    await expect(stars).not.toHaveAttribute('aria-disabled', 'true', { timeout: 40_000 })
    await stars.getByRole('radio', { name: /4 de 5/ }).focus()
    const saved = page.waitForResponse((r) => r.url().endsWith(`/api/entries/${ana.entryId}/vote`))
    await page.keyboard.press('4')
    const response = await saved
    expect(response.status()).toBe(200)
    expect((await response.json()).data.game).toEqual({ xp: 30, achievements: ['first_vote'], level: 2 })
    // El «+5 XP» (sin los 25 del logro) sale junto a las estrellas y el medidor lo traga.
    await expect(page.locator('[data-float-xp]')).toHaveText(/\+5\sXP/)
    await expect(page.locator('[data-notice="level"]')).toContainText('Subes al nivel 2')
    await expect(page.locator('[data-notice="achievement"]')).toContainText('Primer veredicto')
    await expect(xpMeter(page)).toHaveAttribute('aria-valuenow', '155')
    await expect(page.getByRole('banner')).toContainText('Nv 2')
    // RF-GAME-09: recargar no repite ni la subida de nivel ni el aviso.
    await page.waitForTimeout(500)
    await page.reload()
    await expect(xpMeter(page)).toHaveAttribute('aria-valuenow', '155')
    await page.waitForTimeout(1500)
    await expect(page.locator('[data-notice]')).toHaveCount(0)
  })

  await test.step('§3.8.7: el Modo Jurado dice «+5 XP por voto» y acaba en «¡JURADO COMPLETO!» con su logro', async () => {
    // Tres votos por la API; el último, en el Modo Jurado.
    const [last, ...rest] = others
    if (!last) throw new Error('faltan productores')
    for (const who of rest) await apiVote(bea, who.entryId, 3, clock, base)
    await page.goto('/jurado')
    await expect(page.getByRole('heading', { level: 1 })).toContainText(last.alias)
    await expect(page.getByText('+5 XP por voto')).toBeVisible()
    const stars = page.getByRole('radiogroup', { name: new RegExp(last.alias) })
    await expect(stars).not.toHaveAttribute('aria-disabled', 'true', { timeout: 40_000 })
    const saved = page.waitForResponse((r) => r.url().endsWith(`/api/entries/${last.entryId}/vote`))
    await page.keyboard.press('5')
    const game = (await (await saved).json()).data.game
    expect(game.achievements).toEqual(['jury_full'])
    // El «+5 XP» nace junto al combo (el Modo Jurado no lleva el medidor del HUD: se funde ahí).
    await expect(page.locator('[data-float-xp]')).toBeVisible()
    await page.waitForTimeout(250)
    await page.screenshot({ path: shot('7.21-e2e-jurado-combo-1440x900.png') })
    await expect(page.getByRole('heading', { level: 1, name: 'Jurado completo' })).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.locator('main [data-achievement="jury_full"]')).toContainText('Jurado completo')
    await page.screenshot({ path: shot('7.21-e2e-jurado-completo-1440x900.png') })
    await expectNoAxeViolations(page)
  })

  await test.step('RF-GAME-09: la subida de nivel pendiente al cargar sale una vez (Ana subió la primera)', async () => {
    const page = ana.page
    await page.goto('/como-funciona')
    await expect(page.locator('[data-notice="level"]')).toContainText('Subes al nivel 2')
    await page.waitForTimeout(500)
    await page.reload()
    await expect(page.getByRole('banner')).toContainText('Nv 2')
    await page.waitForTimeout(1500)
    await expect(page.locator('[data-notice="level"]')).toHaveCount(0)
  })
})
