import { type BrowserContext, expect, type Page, test } from '@playwright/test'
import { collectErrors, open, settle } from './support'

/**
 * El Escenario, capa 0 (guía §3.5 «Reparto de la capa 0», tarea 1.1): un único lienzo de WebGL que
 * pinta la trama de la cuña igual que la arena estática, que no se descarga antes de la primera pintura
 * (`RNF-PERF-04`) y que no aparece con «reducir movimiento» ni con `bb:stage` = `off`.
 *
 * Sin WebGL (un navegador sin GPU ni SwiftShader), el Escenario no se carga y estas pruebas se saltan:
 * ese caso es la arena estática de siempre, que cubren las demás.
 */

/** Contadores del Escenario en desarrollo (`stage/Stage.tsx`). */
declare global {
  interface Window {
    __bbStage?: { frames: number; probing: boolean; probeFps: number | null }
  }
}

const STAGE_KEY = 'bb:stage'
const QUALITY_KEY = 'bb:quality'

/**
 * Enciende (`on`) o apaga (`off`) el Escenario, o lo deja a su aire (`null`). Con `on`, además, la calidad
 * alta a mano: sin ella, la sonda (1.2) podría elegir otra en una máquina lenta (la CI, con WebGL por
 * software) y apagar el Escenario a mitad de la prueba.
 */
async function setStage(
  context: BrowserContext,
  mode: 'on' | 'off' | null,
  quality: string | null = mode === 'on' ? 'alta' : null,
) {
  await context.addInitScript(
    ([stageKey, stage, qualityKey, level]) => {
      if (stage) window.localStorage.setItem(stageKey, stage)
      else window.localStorage.removeItem(stageKey)
      if (level) window.localStorage.setItem(qualityKey, level)
      else window.localStorage.removeItem(qualityKey)
    },
    [STAGE_KEY, mode, QUALITY_KEY, quality] as const,
  )
}

async function webglAvailable(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas')
    return (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) !== null
  })
}

const live = (page: Page) => page.locator('[data-stage-live]')

/**
 * Proporción de píxeles que cambian más de `threshold` (0–255, en el canal que más cambia) entre dos
 * capturas del mismo tamaño. Se decodifican en el propio navegador (sin dependencias de PNG en Node).
 */
async function differingRatio(page: Page, a: Buffer, b: Buffer, threshold: number): Promise<number> {
  return page.evaluate(
    async ([first, second, limit]) => {
      const decode = async (base64: string) => {
        const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob()
        const bitmap = await createImageBitmap(blob)
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
        const context = canvas.getContext('2d')
        if (!context) throw new Error('sin contexto 2D')
        context.drawImage(bitmap, 0, 0)
        return context.getImageData(0, 0, bitmap.width, bitmap.height).data
      }
      const x = await decode(first)
      const y = await decode(second)
      let differing = 0
      for (let i = 0; i < x.length; i += 4) {
        const channel = (k: number) => Math.abs((x[i + k] ?? 0) - (y[i + k] ?? 0))
        const delta = Math.max(channel(0), channel(1), channel(2))
        if (delta > limit) differing++
      }
      return differing / (x.length / 4)
    },
    [a.toString('base64'), b.toString('base64'), threshold] as const,
  )
}

/**
 * Captura cuando la página ya está quieta: dos capturas seguidas iguales. La geometría de la cuña puede
 * cambiar justo después de montar (Opciones publica el pie de sus pestañas, `--screen-tabs-bottom`) y el
 * Escenario la redibuja al fotograma siguiente; en la CI, con WebGL por software, una captura inmediata
 * podía pillar la cuña de antes (13 % de píxeles distintos a 320 px, 2026-10-06).
 */
async function stableScreenshot(page: Page): Promise<Buffer> {
  let previous = await page.screenshot()
  for (let attempt = 0; attempt < 20; attempt++) {
    await page.waitForTimeout(150)
    const current = await page.screenshot()
    if (current.equals(previous)) return current
    previous = current
  }
  return previous
}

test.describe('Escenario, capa 0', () => {
  test('RNF-PERF-04: el trozo del Escenario se pide después de la primera pintura y el lienzo se enciende', async ({
    page,
  }) => {
    await setStage(page.context(), null, 'alta')
    const errors = collectErrors(page)
    await page.goto('/')
    test.skip(!(await webglAvailable(page)), 'sin WebGL: se queda la arena estática')
    await expect(live(page)).toBeAttached({ timeout: 20_000 })
    const timing = await page.evaluate(() => {
      const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null
      const stage = performance
        .getEntriesByType('resource')
        // Lo pesado: el componente (en desarrollo) o su trozo (en la build), y three y R3F. El módulo de calidad
        // (`stage/quality.ts`) es ligero y va con la arena a propósito (1.2).
        .filter((entry) =>
          /\/stage\/Stage\.tsx|\/Stage-[\w-]+\.js|deps\/(three|@react-three)/.test(entry.name),
        )
        .map((entry) => entry.startTime)
      return { fcp, stage: stage.length ? Math.min(...stage) : null }
    })
    expect(timing.fcp, 'FCP medido').not.toBeNull()
    expect(timing.stage, 'el trozo del Escenario se ha pedido').not.toBeNull()
    expect(timing.stage as number).toBeGreaterThanOrEqual(timing.fcp as number)
    await expect(page.locator('[data-stage] canvas')).toHaveCount(1)
    expect(errors).toEqual([])
  })

  for (const { name, path, heading, width, height, touch } of [
    { name: 'el menú', path: '/dev/menu', heading: 'Beat Battle', width: 1440, height: 900, touch: false },
    {
      name: 'el menú en móvil',
      path: '/dev/menu',
      heading: 'Beat Battle',
      width: 390,
      height: 844,
      touch: true,
    },
    {
      name: '«Cómo se juega»',
      path: '/como-funciona',
      heading: 'Cómo se juega',
      width: 1440,
      height: 900,
      touch: false,
    },
    {
      name: 'Opciones a 320 px',
      path: '/ajustes/sonido',
      heading: 'Sonido y efectos',
      width: 320,
      height: 568,
      touch: false,
    },
  ]) {
    test(`RD-VIS-02 e / §3.5: ${name} se ve igual con la arena en WebGL que con la estática`, async ({
      browser,
    }) => {
      const shots: Buffer[] = []
      let scratch: Page | null = null as Page | null
      for (const mode of ['on', 'off'] as const) {
        // Con «reducir movimiento» para que nada se mueva entre las dos capturas; `on` enciende el
        // Escenario igual.
        const context = await browser.newContext({
          viewport: { width, height },
          hasTouch: touch,
          reducedMotion: 'reduce',
          locale: 'es-ES',
        })
        await setStage(context, mode)
        const page = await context.newPage()
        await open(page, path, heading)
        if (mode === 'on') {
          test.skip(!(await webglAvailable(page)), 'sin WebGL: se queda la arena estática')
          await expect(live(page)).toBeAttached({ timeout: 20_000 })
        } else {
          await expect(page.locator('[data-stage] canvas')).toHaveCount(0)
        }
        await settle(page)
        shots.push(await stableScreenshot(page))
        if (mode === 'off') scratch = page
        else await context.close()
      }
      const [withStage, withoutStage] = shots
      if (!scratch || !withStage || !withoutStage) throw new Error('faltan capturas')
      const page: Page = scratch
      const ratio = await differingRatio(page, withStage, withoutStage, 48)
      // Lo que cambia es el suavizado del borde de algunos puntos (Canvas 2D frente al *shader*): medido,
      // 0,02–0,05 % con la GPU y 0,21 % con el Chromium de la CI. Una cuña del lado equivocado o una forma
      // distinta pasan del 3 %.
      expect(ratio, `${(ratio * 100).toFixed(3)} % de píxeles distintos`).toBeLessThan(0.005)
      await page.context().close()
    })
  }

  test('RNF-A11Y-03 / §3.5: con «reducir movimiento» no hay Escenario: la arena estática', async ({
    browser,
  }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' })
    await setStage(context, null)
    const page = await context.newPage()
    await open(page, '/dev/menu', 'Beat Battle')
    await page.waitForTimeout(3_000)
    await expect(live(page)).toHaveCount(0)
    await expect(page.locator('[data-stage] canvas')).toHaveCount(0)
    await expect(page.locator('[data-halftone="menuWedge"]')).toBeVisible()
    await context.close()
  })

  test('§3.5: con `bb:stage` = `off` no hay Escenario', async ({ browser }) => {
    const context = await browser.newContext()
    await setStage(context, 'off')
    const page = await context.newPage()
    await open(page, '/dev/menu', 'Beat Battle')
    await page.waitForTimeout(3_000)
    await expect(page.locator('[data-stage] canvas')).toHaveCount(0)
    await context.close()
  })

  test('§3.5: el lienzo es único y sobrevive al cambio de pantalla (de la cuña del menú a la de las interiores)', async ({
    page,
  }) => {
    await setStage(page.context(), null, 'alta')
    await open(page, '/dev/menu', 'Beat Battle')
    test.skip(!(await webglAvailable(page)), 'sin WebGL: se queda la arena estática')
    await expect(live(page)).toBeAttached({ timeout: 20_000 })
    const canvas = page.locator('[data-stage] canvas')
    await canvas.evaluate((element) => {
      ;(element as HTMLCanvasElement & { __bbMark?: boolean }).__bbMark = true
    })
    await page.getByRole('menuitem', { name: /Cómo se juega/ }).click()
    await expect(page.locator('main h1')).toHaveText('Cómo se juega')
    await expect(page.locator('[data-wedge="left"][aria-hidden="true"]')).toBeAttached()
    await expect(canvas).toHaveCount(1)
    expect(
      await canvas.evaluate(
        (element) => (element as HTMLCanvasElement & { __bbMark?: boolean }).__bbMark === true,
      ),
    ).toBe(true)
  })

  test('§3.5: la sonda de 2 s decide la calidad, la guarda para la sesión y no se repite al recargar', async ({
    page,
  }) => {
    // Sin la calidad fijada de la configuración: aquí se mide la sonda de verdad.
    await setStage(page.context(), null, null)
    await open(page, '/dev/menu', 'Beat Battle')
    test.skip(!(await webglAvailable(page)), 'sin WebGL: se queda la arena estática')
    await expect
      .poll(() => page.evaluate(() => window.sessionStorage.getItem('bb:stage-probe')), { timeout: 20_000 })
      .toMatch(/^(alta|media|baja|apagada)$/)
    const first = await page.evaluate(() => ({
      quality: window.sessionStorage.getItem('bb:stage-probe'),
      fps: window.__bbStage?.probeFps ?? null,
    }))
    expect(first.fps).toBeGreaterThan(0)
    await page.reload()
    await expect(page.locator('main h1')).toBeAttached()
    await page.waitForTimeout(2_500)
    expect(await page.evaluate(() => window.__bbStage?.probing ?? false)).toBe(false)
    expect(await page.evaluate(() => window.sessionStorage.getItem('bb:stage-probe'))).toBe(first.quality)
  })

  test('RNF-PERF-05: con la pestaña oculta el Escenario no dibuja nada, y vuelve al mostrarla', async ({
    page,
  }) => {
    // Sin la calidad fijada de la configuración: aquí se mide la sonda de verdad.
    await setStage(page.context(), null, null)
    await open(page, '/dev/menu', 'Beat Battle')
    test.skip(!(await webglAvailable(page)), 'sin WebGL: se queda la arena estática')
    // La sonda dibuja sin parar: es cuando el bucle está en marcha.
    await expect
      .poll(() => page.evaluate(() => window.__bbStage?.probing ?? false), { timeout: 20_000 })
      .toBe(true)
    const setHidden = (hidden: boolean) =>
      page.evaluate((value) => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => value })
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          get: () => (value ? 'hidden' : 'visible'),
        })
        document.dispatchEvent(new Event('visibilitychange'))
      }, hidden)
    const frames = () => page.evaluate(() => window.__bbStage?.frames ?? 0)
    await setHidden(true)
    await page.waitForTimeout(200)
    const hiddenStart = await frames()
    await page.waitForTimeout(800)
    expect(await frames(), 'ningún fotograma con la pestaña oculta').toBe(hiddenStart)
    await setHidden(false)
    await expect.poll(frames).toBeGreaterThan(hiddenStart)
  })

  test('§3.5: con la calidad baja elegida a mano, la arena estática; con la media, la trama a dpr 1', async ({
    browser,
  }) => {
    const low = await browser.newContext()
    await setStage(low, null, 'baja')
    const lowPage = await low.newPage()
    await open(lowPage, '/dev/menu', 'Beat Battle')
    await lowPage.waitForTimeout(3_000)
    await expect(lowPage.locator('[data-stage] canvas')).toHaveCount(0)
    await expect(lowPage.locator('[data-halftone="menuWedge"]')).toBeVisible()
    await low.close()

    const medium = await browser.newContext({ deviceScaleFactor: 2 })
    await setStage(medium, null, 'media')
    const mediumPage = await medium.newPage()
    await open(mediumPage, '/dev/menu', 'Beat Battle')
    test.skip(!(await webglAvailable(mediumPage)), 'sin WebGL: se queda la arena estática')
    await expect(live(mediumPage)).toBeAttached({ timeout: 20_000 })
    const ratio = await mediumPage
      .locator('[data-stage] canvas')
      .evaluate((canvas) => (canvas as HTMLCanvasElement).width / canvas.getBoundingClientRect().width)
    expect(ratio).toBeCloseTo(1, 1)
    await medium.close()
  })
})
