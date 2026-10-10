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

/**
 * (a) con la arena en *shader* (tarea 1.12): las capturas de arriba van con «reducir movimiento», que deja
 * la arena estática; aquí `bb:stage` = `on` y la calidad alta encienden el Escenario (la trama de la cuña
 * en WebGL, §3.5) y se mide lo mismo. Sin WebGL se salta: es el caso estático de arriba.
 */
const STAGE_SCREENS = [
  { path: '/', heading: 'Beat Battle', viewport: { width: 1440, height: 900 } },
  { path: '/dev/menu', heading: 'Beat Battle', viewport: { width: 1440, height: 900 } },
  { path: '/dev/menu', heading: 'Beat Battle', viewport: { width: 390, height: 844 } },
  { path: '/jurado', heading: 'Modo Jurado', viewport: { width: 1440, height: 900 } },
  { path: '/como-funciona', heading: 'Cómo se juega', viewport: { width: 1440, height: 900 } },
]

for (const { path, heading, viewport } of STAGE_SCREENS) {
  test(`RD-VIS-02 a: ${path} a ${viewport.width}×${viewport.height} con la arena en shader usa solo la paleta y es ≥ 60 % negro`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('bb:stage', 'on')
      window.localStorage.setItem('bb:quality', 'alta')
    })
    await page.setViewportSize(viewport)
    await page.goto(path)
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(heading)
    const webgl = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      return (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) !== null
    })
    test.skip(!webgl, 'sin WebGL: se queda la arena estática')
    await expect(page.locator('[data-stage-live]')).toBeAttached({ timeout: 20_000 })
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
 * Con teclado y ratón en una ventana pequeña la barra se despega (pasa del 15 % del alto, §3.4.1), pero
 * **la fila de la firma sigue pegada al pie** (v0.6.6): antes se despegaba entera y las interiores, sin
 * lockup, no enseñaban ninguna firma al abrir (cuarto pase del jurado de la 0.28, F2). Se mira al abrir,
 * sin desplazar, con puntero fino.
 */
for (const { width, height } of [
  { width: 390, height: 844 },
  { width: 720, height: 450 },
  { width: 360, height: 640 },
  { width: 823, height: 514 },
]) {
  test.describe(`ventana pequeña con teclado a ${width} × ${height}`, () => {
    test.use({ viewport: { width, height } })

    for (const path of [
      '/como-funciona',
      '/ajustes/sonido',
      '/ajustes/cuenta',
      '/legal/bases',
      '/legal/privacidad',
      '/esto-no-existe',
      '/entrar',
      '/dev/galeria',
    ]) {
      test(`RD-VIS-02 b / RF-OTP-01: en ${path} la firma de la barra se ve al abrir, sin desplazar`, async ({
        page,
      }) => {
        if (path === '/dev/galeria') await openGallery(page)
        else {
          await page.goto(path)
          await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeAttached()
        }
        await settle(page)
        expect(await page.evaluate(() => window.scrollY), 'sin desplazar').toBe(0)
        await expect(page.getByRole('contentinfo').locator('[data-otp-signature]')).toBeInViewport({
          ratio: 1,
        })
      })
    }
  })
}

/**
 * La firma y «Legal» en la barra de móvil (jurado de la 0.28, M3 y su revisión M3r):
 *
 * - **La firma va centrada** en la barra (su columna central), con o sin «Legal»: antes, con «Legal» al
 *   lado, se centraba el grupo y la firma quedaba 30 px a la izquierda (a 390 px, su centro en 164,5).
 * - **«Legal» al lado si cabe**, con un filete vertical (`[data-controls-rule]`) y al menos `MIN_RULE_GAP`
 *   a cada lado (pegado a la firma y con el mismo rótulo, se leía «Other People Records Legal»); **si no
 *   cabe, debajo**, centrado y sin filete. Depende de lo que cabe de verdad (lo mide la barra), no de un
 *   corte fijo: a 390 px no cabe (la firma centrada deja 39 px a cada lado); a 600, sí.
 * - **Con la letra del navegador más grande** (20 y 24 px por defecto), la firma parte en dos líneas
 *   antes que salirse de la ventana (con `nowrap`, a 390 px se cortaba por la izquierda).
 */
const MIN_RULE_GAP = 8

interface Box {
  left: number
  right: number
  top: number
  bottom: number
}

/**
 * Cajas de la firma, del texto de «Legal» (no de su objetivo de 44 px) y del filete, si se ve. Si la barra
 * va despegada (con teclado en una ventana pequeña, §3.4.1), se baja hasta el final de la pantalla: lo que
 * cuenta aquí es cómo se compone al llegar (despegada sigue `sticky` con la fila de la firma pegada, así
 * que `scrollIntoView` no la trae entera).
 */
async function legalLayout(page: Page): Promise<{ signature: Box; legal: Box; rule: Box | null }> {
  const bar = page.getByRole('contentinfo')
  await expect(bar.getByRole('link', { name: 'Legal' })).toBeVisible()
  await settle(page)
  return bar.evaluate((footer) => {
    if (footer.hasAttribute('data-unpinned')) window.scrollTo(0, document.scrollingElement!.scrollHeight)
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
const center = (box: Box) => (box.left + box.right) / 2

/** La firma, centrada en la ventana y entera dentro de ella. */
async function expectSignatureCentered(page: Page, signature: Box) {
  const width = page.viewportSize()!.width
  expect(Math.abs(center(signature) - width / 2), 'firma centrada').toBeLessThanOrEqual(1.5)
  await expect(page.getByRole('contentinfo').locator('[data-otp-signature]')).toBeInViewport({ ratio: 1 })
}

/** Firma, filete y «Legal» en una fila, en ese orden, con el hueco mínimo a cada lado del filete. */
async function expectLegalBeside(page: Page) {
  const { signature, legal, rule } = await legalLayout(page)
  await expectSignatureCentered(page, signature)
  expect(rule, 'filete visible entre la firma y «Legal»').not.toBeNull()
  expect(Math.abs(middle(legal) - middle(signature)), 'misma fila').toBeLessThanOrEqual(2)
  expect(Math.abs(middle(rule!) - middle(signature)), 'filete en la fila').toBeLessThanOrEqual(2)
  expect(rule!.bottom - rule!.top, 'alto del filete').toBeGreaterThanOrEqual(12)
  expect(rule!.left - signature.right, 'firma → filete').toBeGreaterThanOrEqual(MIN_RULE_GAP)
  expect(legal.left - rule!.right, 'filete → «Legal»').toBeGreaterThanOrEqual(MIN_RULE_GAP)
  await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Legal' })).toBeInViewport({
    ratio: 1,
  })
}

/** «Legal» debajo de la firma, centrado y sin filete; la firma, centrada. */
async function expectLegalBelow(page: Page) {
  const { signature, legal, rule } = await legalLayout(page)
  await expectSignatureCentered(page, signature)
  const width = page.viewportSize()!.width
  expect(rule, 'sin filete al lado de «Legal» solo').toBeNull()
  expect(legal.top, '«Legal» debajo de la firma').toBeGreaterThanOrEqual(signature.bottom - 1)
  expect(Math.abs(center(legal) - width / 2), '«Legal» centrado').toBeLessThanOrEqual(2)
  await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Legal' })).toBeInViewport({
    ratio: 1,
  })
}

test.describe('móvil táctil (390 × 844): la firma centrada y «Legal» debajo', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  for (const path of ['/como-funciona', '/entrar', '/ajustes', '/esto-no-existe']) {
    test(`RD-VIS-02 e / RF-OTP-01: en ${path}, la firma va centrada y «Legal», que no cabe al lado, debajo`, async ({
      page,
    }) => {
      await page.goto(path)
      await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeAttached()
      await expectLegalBelow(page)
    })
  }

  test('RD-VIS-02 e / RF-OTP-01: en la galería, la firma va centrada y «Legal» debajo', async ({ page }) => {
    await openGallery(page)
    await expectLegalBelow(page)
  })

  /**
   * Cuarto pase del jurado de la 0.28, F5: en móvil las piezas iban 3 px por debajo del borde de la barra
   * y 7 por encima de su pie (el aire del anillo del foco). La pegatina va centrada en vertical en la
   * barra, con el mismo alto de barra (54 px) y la caja de 44 px entera dentro de la ventana.
   */
  test('RD-VIS-02 e / RF-OTP-01: en el menú, la pegatina de la firma va centrada en vertical en la barra', async ({
    page,
  }) => {
    await page.goto('/dev/menu')
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeAttached()
    await settle(page)
    const { above, below, height } = await page.getByRole('contentinfo').evaluate((footer) => {
      const bar = footer.getBoundingClientRect()
      const sticker = footer.querySelector('[data-otp-signature] img')!.getBoundingClientRect()
      return { above: sticker.top - bar.top, below: bar.bottom - sticker.bottom, height: bar.height }
    })
    expect(
      Math.abs(above - below),
      `${above.toFixed(1)} px arriba y ${below.toFixed(1)} abajo`,
    ).toBeLessThanOrEqual(1)
    expect(height, 'la barra no crece').toBeLessThanOrEqual(54.5)
  })

  test('RD-VIS-02 e / RF-OTP-01: en el menú, sin «Legal», la firma va centrada', async ({ page }) => {
    await page.goto('/dev/menu')
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeAttached()
    await settle(page)
    const signature = await page
      .getByRole('contentinfo')
      .locator('[data-otp-signature]')
      .evaluate((element) => {
        const { left, right, top, bottom } = element.getBoundingClientRect()
        return { left, right, top, bottom }
      })
    await expectSignatureCentered(page, signature)
  })
})

for (const viewport of [
  { width: 375, height: 667, touch: true },
  { width: 360, height: 740, touch: true },
  { width: 390, height: 844, touch: false },
]) {
  test.describe(`móvil a ${viewport.width} × ${viewport.height}${viewport.touch ? ' táctil' : ' con teclado'}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.touch,
      hasTouch: viewport.touch,
    })

    test('RD-VIS-02 e / RF-OTP-01: la firma va centrada y «Legal», debajo, centrado y sin filete', async ({
      page,
    }) => {
      await page.goto('/como-funciona')
      await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeAttached()
      await expectLegalBelow(page)
    })
  })
}

test.describe('móvil táctil ancho (600 × 900): «Legal» al lado de la firma', () => {
  test.use({ viewport: { width: 600, height: 900 }, isMobile: true, hasTouch: true })

  for (const path of ['/como-funciona', '/entrar']) {
    test(`RD-VIS-02 e / RF-OTP-01: en ${path}, la firma va centrada y un filete la separa de «Legal», en la misma fila`, async ({
      page,
    }) => {
      await page.goto(path)
      await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeAttached()
      await expectLegalBeside(page)
    })
  }
})

/**
 * Con la letra del navegador más grande (ajuste de tamaño de letra de Chrome: 20 y 24 px), la firma
 * crece con ella (va en `rem`) y, si no cabe en una línea, parte antes que salirse de la ventana.
 */
for (const fontSize of [20, 24]) {
  for (const width of [390, 320]) {
    test.describe(`móvil táctil a ${width} px con letra de ${fontSize} px`, () => {
      test.use({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true })

      for (const path of ['/dev/menu', '/como-funciona']) {
        test(`RD-VIS-02 b / RF-OTP-01: en ${path}, la firma entera dentro de la ventana, sin desbordar`, async ({
          page,
        }) => {
          const cdp = await page.context().newCDPSession(page)
          await cdp.send('Page.enable')
          await cdp.send('Page.setFontSizes', { fontSizes: { standard: fontSize, fixed: fontSize } })
          await page.goto(path)
          await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeAttached()
          await settle(page)
          const signature = page.getByRole('contentinfo').locator('[data-otp-signature]')
          const root = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)
          expect(root, 'la letra del navegador llega a la página').toBe(`${fontSize}px`)
          await expect(signature).toBeInViewport({ ratio: 1 })
          const overflow = await signature.evaluate((element) =>
            [element, ...element.children].some(
              (node) => node.scrollWidth > node.clientWidth + 1 && node.clientWidth > 0,
            ),
          )
          expect(overflow, 'ningún texto de la firma se sale de su caja').toBe(false)
          if (path !== '/dev/menu') {
            // Con la letra grande, la barra (firma en dos líneas y «Legal» debajo) pasa del 15 % de la
            // ventana y se despega: «Legal» va al final de la pantalla (§3.4.1 v0.6.7).
            const bar = page.getByRole('contentinfo')
            if (await bar.evaluate((footer) => footer.hasAttribute('data-unpinned')))
              await page.evaluate(() => window.scrollTo(0, document.scrollingElement!.scrollHeight))
            await expect(bar.getByRole('link', { name: 'Legal' })).toBeInViewport({ ratio: 1 })
          }
        })
      }
    })
  }
}
