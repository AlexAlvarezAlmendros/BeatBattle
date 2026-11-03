import { expect, type Page, test } from '@playwright/test'
import { collectErrors, open } from './support'

/**
 * El pase de torneo de la carta (guía §3.4.4, §3.5 capa 1; tarea 7.23): en el perfil, con WebGL y el Escenario con
 * calidad alta (la de los E2E), la carta cuelga de su pase en una vista anclada del lienzo único, con su física
 * (Rapier, en un trozo propio); sin WebGL, con «reducir movimiento», con la calidad apagada o en una columna, la carta
 * plana (`RF-GAME-07`). `/p/aina` es la cuenta de verdad de los E2E.
 *
 * Sin WebGL (un navegador sin GPU ni SwiftShader) las pruebas del pase se saltan: ese caso es la carta plana.
 */

/** Lo que el Escenario expone en desarrollo (`window.__bbStage`, tipado entero en `stage.spec.ts`) y lee esta prueba. */
type StageWindow = Window & {
  __bbStage?: { drawCalls: number; animating: boolean; views: { frames: Record<number, number> } }
}

/** El trozo del pase: el componente (en desarrollo) o su trozo (en la build), y Rapier. */
const PASS_CHUNK = /\/stage\/pass\/PassView\.tsx|\/PassView-[\w-]+\.js|@react-three_rapier|rapier3d/

async function webglAvailable(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas')
    return (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) !== null
  })
}

/** Lo que se ha pedido del trozo del pase y la primera pintura. */
function passRequests(page: Page) {
  return page.evaluate((source) => {
    const pattern = new RegExp(source)
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null
    const starts = performance
      .getEntriesByType('resource')
      .filter((entry) => pattern.test(entry.name))
      .map((entry) => entry.startTime)
    return { fcp, starts }
  }, PASS_CHUNK.source)
}

test.describe('el pase de torneo (RF-GAME-07)', () => {
  test.beforeEach(async ({ page }) => {
    // En desarrollo cada módulo es una petición: el búfer de tiempos de recursos (250) se llenaría antes del pase.
    await page.addInitScript(() => performance.setResourceTimingBufferSize(4000))
  })

  test('RF-GAME-07: con WebGL, la carta cuelga de su pase en el Escenario; la plana queda para el lector y C gira las dos', async ({
    page,
  }) => {
    const errors = collectErrors(page)
    await open(page, '/p/aina', 'aina')
    test.skip(!(await webglAvailable(page)), 'sin WebGL: la carta plana')
    const slot = page.locator('[data-pass-room]')
    await expect(slot).toHaveAttribute('data-pass-live', { timeout: 30_000 })
    // La plana sigue en el árbol accesible (con su nombre), transparente bajo la 3D.
    const card = page.getByRole('article', { name: /Carta de luchador de aina/ })
    await expect(card).toHaveCSS('opacity', '0')
    // La vista del pase pinta en el lienzo único.
    expect(await page.locator('[data-stage] canvas').count()).toBe(1)
    await expect
      .poll(() =>
        page.evaluate(() =>
          Object.values((window as StageWindow).__bbStage?.views.frames ?? {}).some((n) => n > 0),
        ),
      )
      .toBe(true)
    await page.keyboard.press('c')
    await expect(card).toHaveAttribute('data-side', 'back')
    expect(await page.evaluate(() => (window as StageWindow).__bbStage?.drawCalls ?? 0)).toBeLessThan(120)
    expect(errors).toEqual([])
  })

  test('RF-GAME-07: la carta se arrastra con el puntero, se balancea y vuelve a dormirse', async ({
    page,
  }) => {
    await open(page, '/p/aina', 'aina')
    test.skip(!(await webglAvailable(page)), 'sin WebGL: la carta plana')
    await expect(page.locator('[data-pass-live]')).toBeAttached({ timeout: 30_000 })
    const card = await page.locator('[data-producer-card]').boundingBox()
    if (!card) throw new Error('sin carta')
    const x = card.x + card.width * 0.7
    const y = card.y + card.height * 0.8
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 90, y - 40, { steps: 10 })
    await expect.poll(() => page.evaluate(() => (window as StageWindow).__bbStage?.animating)).toBe(true)
    await page.mouse.up()
    // Suelta, se para y se duerme: el Escenario vuelve a pintar solo bajo demanda.
    await expect
      .poll(() => page.evaluate(() => (window as StageWindow).__bbStage?.animating), { timeout: 20_000 })
      .toBe(false)
  })

  test('RNF-PERF-04: el trozo del pase (con Rapier) solo se pide en el perfil, después de la primera pintura', async ({
    page,
  }) => {
    await open(page, '/como-funciona', 'Cómo se juega')
    test.skip(!(await webglAvailable(page)), 'sin WebGL: la carta plana')
    await expect(page.locator('[data-stage-live]')).toBeAttached({ timeout: 20_000 })
    expect((await passRequests(page)).starts).toEqual([])
    await open(page, '/p/aina', 'aina')
    await expect(page.locator('[data-pass-live]')).toBeAttached({ timeout: 30_000 })
    const { fcp, starts } = await passRequests(page)
    expect(fcp, 'FCP medido').not.toBeNull()
    expect(starts.length).toBeGreaterThan(0)
    expect(Math.min(...starts)).toBeGreaterThanOrEqual(fcp as number)
  })

  test.describe('con «reducir movimiento»', () => {
    test.use({ reducedMotion: 'reduce' })

    test('RF-GAME-07: con «reducir movimiento», la carta plana: sin hueco del pase y sin pedir Rapier', async ({
      page,
    }) => {
      await open(page, '/p/aina', 'aina')
      await expect(page.getByRole('article', { name: /Carta de luchador de aina/ })).toBeVisible()
      await page.waitForTimeout(1500)
      await expect(page.locator('[data-pass-room]')).toHaveCount(0)
      expect((await passRequests(page)).starts).toEqual([])
    })
  })

  test.describe('con la calidad apagada', () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => window.localStorage.setItem('bb:quality', 'apagada'))
    })

    test('RF-GAME-07: con la calidad apagada, la carta plana y sin pase', async ({ page }) => {
      await open(page, '/p/aina', 'aina')
      await expect(page.getByRole('article', { name: /Carta de luchador de aina/ })).toBeVisible()
      await page.waitForTimeout(1500)
      await expect(page.locator('[data-pass-room]')).toHaveCount(0)
      expect((await passRequests(page)).starts).toEqual([])
    })
  })

  test.describe('móvil (390 × 844)', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

    test('RF-GAME-07: en una columna (la diagonal cruza la pieza), la carta plana y sin pase', async ({
      page,
    }) => {
      await open(page, '/p/aina', 'aina')
      await expect(page.getByRole('article', { name: /Carta de luchador de aina/ })).toBeVisible()
      await page.waitForTimeout(1500)
      await expect(page.locator('[data-pass-room]')).toHaveCount(0)
      expect((await passRequests(page)).starts).toEqual([])
    })
  })
})
