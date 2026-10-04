import { expect, type Page, test } from '@playwright/test'
import { open, settle } from './support'

/**
 * Composición de las pantallas interiores (guía §3.8.14, §3.8.11; `RD-VIS-02` e: segundo pase del
 * jurado visual de la tarea 0.28). La plantilla (`ScreenPage`) reparte la pantalla como las maquetas
 * (`00-titulo`, `02-seleccion`, `05-perfil`): nada de medio panel arriba y la otra mitad vacía.
 *
 * - **Autenticación** como pantalla de título: el logo con su lockup y el panel, centrados en vertical
 *   entre el HUD y la barra, con el pie del panel a la altura del lockup; en móvil, el panel anclado al
 *   pie, encima de la barra.
 * - **Pantallas con pieza** («Cómo se juega», la 404, Opciones): el panel de la derecha llega al pie
 *   de la pieza de la cuña.
 * - **404 en móvil**: el subtítulo va con el titular, antes del pad, y se ve sin desplazar.
 * - **Granate de la cuña** en Opciones, con su pieza encima, dentro del rango de las maquetas (§3.1:
 *   «unos 15 %»; como mucho el 24,5 % de `02-seleccion` en escritorio y el 18 % de las maquetas
 *   móviles), con el criterio del acta del jurado (grupo 24): r 25–110, g < 0,45 r, b < 0,6 r.
 */

test.use({ reducedMotion: 'reduce' })

interface Box {
  top: number
  bottom: number
  left: number
  right: number
}

/** Cajas de unos cuantos elementos (la primera coincidencia de cada selector) y de la barra y el HUD. */
async function boxes<K extends string>(
  page: Page,
  selectors: Record<K, string>,
): Promise<Record<K | 'hud' | 'bar', Box>> {
  const all = { ...selectors, hud: '.game-frame > header', bar: '.game-frame > footer' }
  const found = await page.evaluate((entries) => {
    const result: Record<string, Box | null> = {}
    for (const [name, selector] of entries) {
      const element = document.querySelector(selector)
      const rect = element?.getBoundingClientRect()
      result[name] = rect ? { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right } : null
    }
    return result
  }, Object.entries(all))
  for (const [name, box] of Object.entries(found)) expect(box, `no está «${name}»`).not.toBeNull()
  return found as Record<K | 'hud' | 'bar', Box>
}

const PANEL = 'main [data-screen-part="panel"]'
const PIECE = 'main [data-screen-part="piece"]'

/** Proporción de píxeles granate de una captura (criterio del acta, grupo 24), medida en el navegador. */
async function wineShare(page: Page): Promise<number> {
  const png = await page.screenshot()
  return page.evaluate(async (data) => {
    const image = new Image()
    image.src = `data:image/png;base64,${data}`
    await image.decode()
    const canvas = new OffscreenCanvas(image.width, image.height)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(image, 0, 0)
    const { data: px } = ctx.getImageData(0, 0, image.width, image.height)
    let wine = 0
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i]!
      if (r >= 25 && r <= 110 && px[i + 1]! < 0.45 * r && px[i + 2]! < 0.6 * r) wine += 1
    }
    return wine / (px.length / 4)
  }, png.toString('base64'))
}

test.describe('1440 × 900', () => {
  test('RD-VIS-02 e: la autenticación es una pantalla de título, con el logo y el panel centrados entre el HUD y la barra', async ({
    page,
  }) => {
    await open(page, '/entrar', 'Entrar')
    await settle(page)
    const box = await boxes(page, { title: 'main [data-title-piece]', panel: PANEL })
    const top = Math.min(box.title.top, box.panel.top)
    const bottom = Math.max(box.title.bottom, box.panel.bottom)
    const above = top - box.hud.bottom
    const below = box.bar.top - bottom
    // Centrado entre el HUD y la barra: el hueco de arriba y el de abajo, parecidos.
    expect(Math.abs(above - below), `arriba ${above} px · abajo ${below} px`).toBeLessThanOrEqual(64)
    // El logo al tamaño del de `00-titulo` (unos 750 px de «BATTLE»): llena el alto, no se queda arriba.
    expect(box.title.bottom - box.title.top).toBeGreaterThanOrEqual(330)
    // El pie del panel, a la altura del lockup.
    expect(Math.abs(box.panel.bottom - box.title.bottom)).toBeLessThanOrEqual(4)
  })

  test('RD-VIS-02 e: «Cómo se juega» estira el panel de reglas hasta el pie de la lista de movimientos', async ({
    page,
  }) => {
    await open(page, '/como-funciona', 'Cómo se juega')
    await settle(page)
    const box = await boxes(page, {
      panel: PANEL,
      back: `${PIECE} ul > li:last-child > a`,
      lastRule: 'main ol > li:last-child',
    })
    // El pie del panel, a la altura de «Volver al menú».
    expect(Math.abs(box.panel.bottom - box.back.bottom)).toBeLessThanOrEqual(2)
    // Las cinco filas se reparten el alto del panel: la última llega a su pie.
    expect(box.panel.bottom - box.lastRule.bottom).toBeLessThanOrEqual(48)
  })

  test('RD-VIS-02 e: la 404 estira el panel del subtítulo hasta el pie del pad', async ({ page }) => {
    await open(page, '/esto-no-existe', 'Bonus stage')
    await settle(page)
    const box = await boxes(page, { panel: PANEL, piece: PIECE })
    expect(Math.abs(box.panel.bottom - box.piece.bottom)).toBeLessThanOrEqual(2)
  })

  test('RD-VIS-02 e: Opciones lleva su pieza en la cuña y el panel llega a su pie', async ({ page }) => {
    await open(page, '/ajustes', 'Sonido y efectos')
    await settle(page)
    const box = await boxes(page, { panel: PANEL, piece: PIECE })
    expect(box.piece.bottom - box.piece.top).toBeGreaterThanOrEqual(240)
    expect(Math.abs(box.panel.bottom - box.piece.bottom)).toBeLessThanOrEqual(2)
  })

  for (const path of ['/ajustes', '/ajustes/cuenta']) {
    test(`§3.1 / RD-VIS-02 e: la cuña de ${path} no pasa del granate de las maquetas (≤ 24,5 %)`, async ({
      page,
    }) => {
      await page.goto(path)
      await expect(page.locator(PIECE)).toBeVisible()
      await settle(page)
      const share = await wineShare(page)
      expect(share, `granate ${(share * 100).toFixed(1)} %`).toBeLessThanOrEqual(0.245)
    })
  }
})

test.describe('390 × 844', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('RD-VIS-02 e: en móvil, el panel de la autenticación queda anclado al pie, encima de la barra', async ({
    page,
  }) => {
    await open(page, '/entrar', 'Entrar')
    await settle(page)
    const box = await boxes(page, { title: 'main [data-title-piece]', panel: PANEL })
    const gap = box.bar.top - box.panel.bottom
    expect(gap, `${gap} px entre el panel y la barra`).toBeGreaterThanOrEqual(0)
    expect(gap, `${gap} px entre el panel y la barra`).toBeLessThanOrEqual(24)
    // El logo, entre el título y el panel (no pegado arriba con el hueco debajo).
    expect(box.panel.top - box.title.bottom).toBeGreaterThanOrEqual(48)
  })

  test('RD-VIS-02 e / §3.8.11: en móvil, el subtítulo de la 404 va con el titular, antes del pad, y se ve sin desplazar', async ({
    page,
  }) => {
    await open(page, '/esto-no-existe', 'Bonus stage')
    await settle(page)
    const subtitle = page.getByRole('main').getByText('Te has perdido… pero ya que estás.')
    const box = await boxes(page, {
      head: 'main [data-screen-part="head"]',
      pad: 'main figure',
      subtitle: `${PANEL} p`,
    })
    expect(box.subtitle.top).toBeGreaterThanOrEqual(box.head.bottom)
    expect(box.subtitle.bottom).toBeLessThanOrEqual(box.pad.top)
    expect(box.subtitle.bottom).toBeLessThanOrEqual(box.bar.top)
    await expect(subtitle).toBeInViewport({ ratio: 1 })
  })

  for (const path of ['/ajustes', '/ajustes/cuenta']) {
    test(`§3.1 / RD-VIS-02 e: en móvil, la cuña de ${path} no pasa del granate de las maquetas (≤ 18 %)`, async ({
      page,
    }) => {
      await page.goto(path)
      await expect(page.locator(PIECE)).toBeVisible()
      await settle(page)
      const share = await wineShare(page)
      expect(share, `granate ${(share * 100).toFixed(1)} %`).toBeLessThanOrEqual(0.18)
    })
  }
})
