import { expect, type Page, test } from '@playwright/test'
import { openGallery, ROUTES, settle } from './support'

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

  // Las pantallas más altas que la ventana (Cómo se juega, Opciones, legales) incluidas: la barra de
  // controles va pegada al pie, así que la firma se ve al abrir la pantalla, sin bajar (§3.4.1).
  for (const path of ['/', '/como-funciona', '/esto-no-existe', '/ajustes/cuenta', '/legal/bases']) {
    test(`RD-VIS-02 b / RF-OTP-01: la firma del sello se ve en ${path} en móvil, dentro de la ventana`, async ({
      page,
    }) => {
      await page.goto(path)
      await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeAttached()
      const visible = page.locator('[data-otp-signature]').filter({ visible: true })
      await expect(visible.first()).toBeVisible()
      await expect(page.getByRole('contentinfo').locator('[data-otp-signature]')).toBeInViewport()
    })
  }
})

/**
 * «Legal» junto a la firma en móvil (jurado de la 0.28, M3): con «Legal» a 12 px de «OTHER PEOPLE
 * RECORDS» y con el mismo rótulo, la barra se leía «Other People Records Legal», como si fuera parte del
 * nombre del sello. En las pantallas con «Legal» (interiores, autenticación, 404, galería) un filete
 * vertical (`[data-controls-rule]`) lo separa de la firma, con al menos `MIN_RULE_GAP` a cada lado, en
 * la misma fila; si no caben en una (< 373 px), «Legal» baja a su propia fila, centrado y sin filete.
 */
const MIN_RULE_GAP = 8

interface Box {
  left: number
  right: number
  top: number
  bottom: number
}

/** Cajas de la firma, del texto de «Legal» (no de su objetivo de 44 px) y del filete, si se ve. */
async function legalLayout(page: Page): Promise<{ signature: Box; legal: Box; rule: Box | null }> {
  const bar = page.getByRole('contentinfo')
  await expect(bar.getByRole('link', { name: 'Legal' })).toBeVisible()
  await settle(page)
  return bar.evaluate((footer) => {
    const box = ({ left, right, top, bottom }: DOMRect) => ({ left, right, top, bottom })
    const signature = footer.querySelector('[data-otp-signature]')!
    const legal = footer.querySelector('a[href^="/legal/"]')!
    const text = document.createRange()
    text.selectNodeContents(legal)
    const rule = footer.querySelector<HTMLElement>('[data-controls-rule]')
    const style = rule && getComputedStyle(rule)
    const painted =
      !!rule &&
      !!style &&
      rule.getClientRects().length > 0 &&
      style.visibility !== 'hidden' &&
      style.borderInlineStartStyle !== 'none' &&
      Number.parseFloat(style.borderInlineStartWidth) >= 1
    return {
      signature: box(signature.getBoundingClientRect()),
      legal: box(text.getBoundingClientRect()),
      rule: painted ? box(rule.getBoundingClientRect()) : null,
    }
  })
}

const middle = (box: Box) => (box.top + box.bottom) / 2

/** Firma, filete y «Legal» en una fila, en ese orden, con el hueco mínimo a cada lado del filete. */
async function expectRuleBetween(page: Page) {
  const { signature, legal, rule } = await legalLayout(page)
  expect(rule, 'filete visible entre la firma y «Legal»').not.toBeNull()
  expect(Math.abs(middle(legal) - middle(signature)), 'misma fila').toBeLessThanOrEqual(2)
  expect(Math.abs(middle(rule!) - middle(signature)), 'filete en la fila').toBeLessThanOrEqual(2)
  expect(rule!.bottom - rule!.top, 'alto del filete').toBeGreaterThanOrEqual(12)
  expect(rule!.left - signature.right, 'firma → filete').toBeGreaterThanOrEqual(MIN_RULE_GAP)
  expect(legal.left - rule!.right, 'filete → «Legal»').toBeGreaterThanOrEqual(MIN_RULE_GAP)
  await expect(page.getByRole('contentinfo').locator('[data-otp-signature]')).toBeInViewport({ ratio: 1 })
  await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Legal' })).toBeInViewport({
    ratio: 1,
  })
}

test.describe('móvil táctil (390 × 844): «Legal» separado de la firma', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  for (const path of ['/como-funciona', '/entrar', '/ajustes', '/esto-no-existe']) {
    test(`RD-VIS-02 e / RF-OTP-01: en ${path}, un filete separa «Legal» de la firma, en la misma fila`, async ({
      page,
    }) => {
      await page.goto(path)
      await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeAttached()
      await expectRuleBetween(page)
    })
  }

  test('RD-VIS-02 e / RF-OTP-01: en la galería, un filete separa «Legal» de la firma', async ({ page }) => {
    await openGallery(page)
    await expectRuleBetween(page)
  })
})

test.describe('móvil táctil (375 × 667, maqueta 01-menu-375x667): «Legal» separado de la firma', () => {
  test.use({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true })

  test('RD-VIS-02 e / RF-OTP-01: firma, filete y «Legal» caben en una fila', async ({ page }) => {
    await page.goto('/como-funciona')
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeAttached()
    await expectRuleBetween(page)
  })
})

test.describe('ventana estrecha con teclado (390 × 844): «Legal» separado de la firma', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('RD-VIS-02 e / RF-OTP-01: con las teclas encima, firma, filete y «Legal» en una fila', async ({
    page,
  }) => {
    await page.goto('/como-funciona')
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeAttached()
    await expectRuleBetween(page)
  })
})

test.describe('móvil táctil (360 × 740): «Legal» en su propia fila', () => {
  test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true })

  test('RD-VIS-02 e / RF-OTP-01: si no caben en una fila, «Legal» va debajo de la firma, centrado y sin filete', async ({
    page,
  }) => {
    await page.goto('/como-funciona')
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeAttached()
    const { signature, legal, rule } = await legalLayout(page)
    expect(rule, 'sin filete al lado de «Legal» solo').toBeNull()
    expect(legal.top, '«Legal» debajo de la firma').toBeGreaterThanOrEqual(signature.bottom - 1)
    expect(Math.abs((legal.left + legal.right) / 2 - 180), '«Legal» centrado').toBeLessThanOrEqual(2)
    await expect(page.getByRole('contentinfo').locator('[data-otp-signature]')).toBeInViewport({ ratio: 1 })
  })
})
