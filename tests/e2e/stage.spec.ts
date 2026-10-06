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

const STAGE_KEY = 'bb:stage'

async function setStage(context: BrowserContext, mode: 'on' | 'off' | null) {
  await context.addInitScript(
    ([key, value]) => {
      if (value) window.localStorage.setItem(key, value)
      else window.localStorage.removeItem(key)
    },
    [STAGE_KEY, mode] as const,
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
interface Difference {
  ratio: number
  /** Caja de los píxeles distintos (px de la captura), para saber dónde está la diferencia. */
  box: { x0: number; y0: number; x1: number; y1: number } | null
}

async function differingRatio(page: Page, a: Buffer, b: Buffer, threshold: number): Promise<Difference> {
  return page.evaluate(
    async ([first, second, limit]) => {
      const decode = async (base64: string) => {
        const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob()
        const bitmap = await createImageBitmap(blob)
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
        const context = canvas.getContext('2d')
        if (!context) throw new Error('sin contexto 2D')
        context.drawImage(bitmap, 0, 0)
        return { data: context.getImageData(0, 0, bitmap.width, bitmap.height).data, width: bitmap.width }
      }
      const { data: x, width } = await decode(first)
      const { data: y } = await decode(second)
      let differing = 0
      let box: { x0: number; y0: number; x1: number; y1: number } | null = null
      for (let i = 0; i < x.length; i += 4) {
        const channel = (k: number) => Math.abs((x[i + k] ?? 0) - (y[i + k] ?? 0))
        const delta = Math.max(channel(0), channel(1), channel(2))
        if (delta > limit) {
          differing++
          const px = (i / 4) % width
          const py = Math.floor(i / 4 / width)
          box = box
            ? {
                x0: Math.min(box.x0, px),
                y0: Math.min(box.y0, py),
                x1: Math.max(box.x1, px),
                y1: Math.max(box.y1, py),
              }
            : { x0: px, y0: py, x1: px, y1: py }
        }
      }
      return { ratio: differing / (x.length / 4), box }
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

/** Estado de la página para el diagnóstico de la comparación (lo que puede mover la cuña o el contenido). */
function pageState(page: Page) {
  return page.evaluate(() => {
    const point = (name: string) => {
      const probe = document.querySelector(`[data-stage-edge="${name}"]`)
      if (!probe) return null
      const rect = probe.getBoundingClientRect()
      return [Math.round(rect.left), Math.round(rect.top)]
    }
    const active = document.activeElement
    return {
      scrollY: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      tabsBottom: document.documentElement.style.getPropertyValue('--screen-tabs-bottom') || null,
      edges: { a: point('a'), b: point('b'), in: point('in') },
      live: document.querySelector('[data-stage-live]') !== null,
      active: active ? `${active.tagName.toLowerCase()}${active.id ? `#${active.id}` : ''}` : null,
      fonts: document.fonts.status,
    }
  })
}

test.describe('Escenario, capa 0', () => {
  test('RNF-PERF-04: el trozo del Escenario se pide después de la primera pintura y el lienzo se enciende', async ({
    page,
  }) => {
    const errors = collectErrors(page)
    await page.goto('/')
    test.skip(!(await webglAvailable(page)), 'sin WebGL: se queda la arena estática')
    await expect(live(page)).toBeAttached({ timeout: 20_000 })
    const timing = await page.evaluate(() => {
      const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null
      const stage = performance
        .getEntriesByType('resource')
        .filter((entry) => /\/stage\/|Stage[-.]/.test(entry.name))
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
      const states: Record<string, unknown> = {}
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
        states[mode] = await pageState(page)
        // `BB_STAGE_DEBUG=1` imprime el estado de cada página aunque la prueba pase.
        if (process.env.BB_STAGE_DEBUG) console.log(name, mode, JSON.stringify(states[mode]))
        if (mode === 'off') scratch = page
        else await context.close()
      }
      const [withStage, withoutStage] = shots
      if (!scratch || !withStage || !withoutStage) throw new Error('faltan capturas')
      const page: Page = scratch
      const { ratio, box } = await differingRatio(page, withStage, withoutStage, 48)
      // Lo que cambia es el suavizado del borde de algunos puntos (Canvas 2D frente al *shader*): medido,
      // 0,02–0,05 % con la GPU y 0,21 % con el Chromium de la CI. Una cuña del lado equivocado o una forma
      // distinta pasan del 3 %.
      // Si falla, el mensaje dice dónde está la diferencia y el estado de cada página (2026-10-06: fallaba a
      // veces en la CI a 320 px con un 13,43 % y no se reproducía en local).
      expect(
        ratio,
        `${(ratio * 100).toFixed(3)} % de píxeles distintos en ${JSON.stringify(box)}; estado: ${JSON.stringify(states)}`,
      ).toBeLessThan(0.005)
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
})
