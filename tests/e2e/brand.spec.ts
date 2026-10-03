import { expect, type Page, test } from '@playwright/test'
import { ROUTES, settle } from './support'

/**
 * Prueba de marca y de juego (`RD-VIS-02`, guía §3.10; tarea 0.27):
 *
 * - **(a) Paleta y negro**, medidos en capturas: toda la paleta de la arena vive en el triángulo
 *   negro–rojo–blanco (el granate es casi 0,25 · rojo + 0,05 · blanco); como mucho el 0,1 % de los
 *   píxeles se sale de él (tolerancia de 8/255 y de 0,03 en los pesos) y al menos el 60 % tiene una
 *   luminancia relativa por debajo de 0,06. Chrome con `--disable-lcd-text` (el suavizado de subpíxel
 *   pinta bordes de color fuera de la paleta), sin imágenes de usuario y con «reducir movimiento» (nada a
 *   medio animar).
 * - **(b) La firma**: `[data-otp-signature]` visible en cada ruta (`RF-OTP-01`).
 *
 * (c) es el lint de piezas prohibidas (`pnpm lint:tokens`); (d), el recorrido con teclado de
 * `keyboard.spec.ts`; (e), el acta del jurado (0.28).
 */

const ci = !!process.env.CI
const software = !!process.env.PW_SOFTWARE
const GPU_ARGS =
  ci || software ? [] : ['--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan']

test.use({ launchOptions: { args: [...GPU_ARGS, '--disable-lcd-text'] }, reducedMotion: 'reduce' })

/** Rojo de marca y blanco: los vértices del triángulo con el negro (§3.2, §3.10). */
const RED = [255, 0, 60] as const

interface PaletteStats {
  pixels: number
  outside: number
  dark: number
  /** Unos cuantos colores fuera, para el mensaje si falla. */
  samples: string[]
}

/** Mide una captura PNG dentro del navegador (canvas 2D por CPU): fuera del triángulo y oscuros. */
async function measure(page: Page, png: Buffer): Promise<PaletteStats> {
  return page.evaluate(
    async ({ data, red }) => {
      const image = new Image()
      image.src = `data:image/png;base64,${data}`
      await image.decode()
      const canvas = new OffscreenCanvas(image.width, image.height)
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(image, 0, 0)
      const { data: px } = ctx.getImageData(0, 0, image.width, image.height)
      const linear = (v: number) => {
        const c = v / 255
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      }
      const TOLERANCE = 8
      const WEIGHT = 0.03
      let outside = 0
      let dark = 0
      const samples = new Set<string>()
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i]!
        const g = px[i + 1]!
        const b = px[i + 2]!
        // r = 255 (a + w), g = 255 w, b = 60 a + 255 w (rojo a, blanco w, negro 1 − a − w).
        const w = g / 255
        const a = r / 255 - w
        const inside =
          a >= -WEIGHT &&
          w >= -WEIGHT &&
          a + w <= 1 + WEIGHT &&
          Math.abs(b - (red[2] * a + 255 * w)) <= TOLERANCE
        if (!inside) {
          outside += 1
          if (samples.size < 8) samples.add(`rgb(${r},${g},${b})`)
        }
        const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
        if (luminance < 0.06) dark += 1
      }
      return { pixels: px.length / 4, outside, dark, samples: [...samples] }
    },
    { data: png.toString('base64'), red: RED },
  )
}

const SCREENS = [
  ...ROUTES.map((route) => ({ ...route, viewport: { width: 1440, height: 900 } })),
  { path: '/', heading: 'Beat Battle', viewport: { width: 390, height: 844 } },
  { path: '/dev/menu', heading: 'Beat Battle', viewport: { width: 390, height: 844 } },
  { path: '/como-funciona', heading: 'Cómo se juega', viewport: { width: 390, height: 844 } },
]

for (const { path, heading, viewport } of SCREENS) {
  test(`RD-VIS-02 a: ${path} a ${viewport.width}×${viewport.height} usa solo la paleta y es ≥ 60 % negro`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.goto(path)
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(heading)
    await settle(page)
    const stats = await measure(page, await page.screenshot())
    const outside = stats.outside / stats.pixels
    const dark = stats.dark / stats.pixels
    const summary = `fuera ${(outside * 100).toFixed(3)} % · negro ${(dark * 100).toFixed(1)} % · ${stats.samples.join(' ')}`
    test.info().annotations.push({ type: 'paleta', description: summary })
    expect(outside, summary).toBeLessThanOrEqual(0.001)
    expect(dark, summary).toBeGreaterThanOrEqual(0.6)
  })
}

for (const { path, heading } of ROUTES) {
  test(`RD-VIS-02 b / RF-OTP-01: la firma del sello se ve en ${path}`, async ({ page }) => {
    await page.goto(path)
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(heading)
    const signatures = page.locator('[data-otp-signature]')
    expect(await signatures.count()).toBeGreaterThan(0)
    await expect(signatures.first()).toBeVisible()
    // Siempre enlazada al sello, en otra pestaña, con su nombre.
    for (const signature of await signatures.all()) {
      await expect(signature).toHaveAttribute('href', 'https://www.otherpeople.es/')
      await expect(signature).toHaveAttribute('target', '_blank')
      await expect(signature).toHaveAccessibleName(/Other People/)
    }
  })
}

test.describe('móvil (390 × 844)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  for (const path of ['/', '/como-funciona', '/esto-no-existe']) {
    test(`RD-VIS-02 b / RF-OTP-01: la firma del sello se ve en ${path} en móvil`, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeAttached()
      const visible = page.locator('[data-otp-signature]').filter({ visible: true })
      await expect(visible.first()).toBeVisible()
    })
  }
})
