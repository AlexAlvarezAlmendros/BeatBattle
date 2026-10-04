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

/**
 * Hueco máximo entre el pie de las columnas y la barra en las pantallas que llenan el alto (`fill`): el
 * contenido deja 32 px de margen abajo (`.game-main`), y las maquetas llegan casi a la barra.
 */
const BAR_GAP = 48

/** Las interiores con pieza que llenan la pantalla (`ScreenPage` con `fill`). */
const FILL_SCREENS = [
  { path: '/como-funciona', heading: 'Cómo se juega' },
  { path: '/ajustes', heading: 'Sonido y efectos' },
  { path: '/ajustes/sesiones', heading: 'Sesiones' },
  { path: '/esto-no-existe', heading: 'Bonus stage' },
]

/**
 * Huecos entre los hijos visibles de una caja, de arriba abajo (sin los que van fuera del flujo, como
 * el `<h1>` solo para lectores de pantalla): dentro de un panel o de una columna, nada de huecos vacíos.
 */
async function innerGaps(page: Page, selector: string): Promise<number[]> {
  return page.evaluate((sel) => {
    const rects = [...document.querySelector(sel)!.children]
      .filter((child) => getComputedStyle(child).position !== 'absolute')
      .map((child) => child.getBoundingClientRect())
      .filter((rect) => rect.height > 0)
      .sort((a, b) => a.top - b.top)
    return rects.slice(1).map((rect, index) => Math.round(rect.top - rects[index]!.bottom))
  }, selector)
}

/** Baja hasta el final de la página (en ventanas bajas, lo que no cabe se desplaza). */
async function scrollToEnd(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await page.waitForFunction(
    () => Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 1,
  )
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

  test('RD-VIS-02 e: «Cómo se juega» llena el alto entre el HUD y la barra: la lista de movimientos y el panel de reglas llegan a la barra (J2r)', async ({
    page,
  }) => {
    await open(page, '/como-funciona', 'Cómo se juega')
    await settle(page)
    const box = await boxes(page, {
      panel: PANEL,
      piece: PIECE,
      back: `${PIECE} ul > li:last-child > a`,
      lastRule: 'main ol > li:last-child',
    })
    // Como las maquetas de interiores (`02-seleccion`, `05-perfil`): las dos columnas, hasta la barra.
    expect(box.bar.top - box.panel.bottom, 'hueco bajo el panel').toBeLessThanOrEqual(BAR_GAP)
    expect(box.bar.top - box.back.bottom, 'hueco bajo la lista').toBeLessThanOrEqual(BAR_GAP)
    expect(box.panel.bottom).toBeLessThanOrEqual(box.bar.top)
    // Sin hueco dentro del panel: las filas de las reglas se reparten su alto.
    expect(box.panel.bottom - box.lastRule.bottom).toBeLessThanOrEqual(48)
    // Sin hueco dentro de la lista: los movimientos se reparten el alto, «Volver al menú» al pie.
    const gaps = await page.evaluate((selector) => {
      const items = [...document.querySelectorAll(`${selector} ul > li > a`)].map((a) =>
        a.getBoundingClientRect(),
      )
      return items.slice(1).map((rect, index) => rect.top - items[index]!.bottom)
    }, PIECE)
    for (const gap of gaps) expect(gap, `huecos entre placas: ${gaps.join(', ')}`).toBeLessThanOrEqual(24)
  })

  for (const { path, heading } of FILL_SCREENS.filter((screen) => screen.path !== '/como-funciona')) {
    test(`RD-VIS-02 e: ${path} llena el alto entre el HUD y la barra, sin huecos dentro del panel (J3r)`, async ({
      page,
    }) => {
      await open(page, path, heading)
      await settle(page)
      const box = await boxes(page, { panel: PANEL, piece: PIECE })
      for (const name of ['panel', 'piece'] as const) {
        expect(box[name].bottom, `pie de «${name}» y barra`).toBeLessThanOrEqual(box.bar.top)
        expect(box.bar.top - box[name].bottom, `hueco bajo «${name}»`).toBeLessThanOrEqual(BAR_GAP)
      }
      // El contenido del panel se reparte: lo suyo arriba, filas que comparten el alto, acciones al pie.
      const gaps = await innerGaps(page, PANEL)
      for (const gap of gaps) expect(gap, `huecos en el panel: ${gaps.join(', ')}`).toBeLessThanOrEqual(40)
      // Y el de la última lista del panel (reglas, opciones, leyenda) llega a su pie.
      const lastRow = await page.evaluate((sel) => {
        const rows = document.querySelectorAll(`${sel} section li`)
        return rows[rows.length - 1]?.getBoundingClientRect().bottom ?? 0
      }, PANEL)
      const listEnd = await page.evaluate(
        (sel) => document.querySelector(`${sel} section`)!.getBoundingClientRect().bottom,
        PANEL,
      )
      expect(listEnd - lastRow, 'hueco bajo la última fila').toBeLessThanOrEqual(2)
    })
  }

  test('RD-VIS-02 e: en Opciones, la vista previa de la cuña llena la columna, con su pie abajo (J3r)', async ({
    page,
  }) => {
    for (const { path, heading } of FILL_SCREENS.filter((screen) => screen.path.startsWith('/ajustes'))) {
      await open(page, path, heading)
      await settle(page)
      // Las placas, seguidas y más altas que en la columna suelta (56 px), sin pasar del doble.
      const gaps = await innerGaps(page, `${PIECE} figure ul`)
      for (const gap of gaps)
        expect(gap, `${path}: huecos entre placas ${gaps.join(', ')}`).toBeLessThanOrEqual(24)
      const heights = await page.evaluate(
        (sel) =>
          [...document.querySelectorAll(`${sel} figure li`)].map((li) => li.getBoundingClientRect().height),
        PIECE,
      )
      for (const height of heights) {
        expect(height, `${path}: placas de ${heights.join(', ')} px`).toBeGreaterThan(56)
        expect(height, `${path}: placas de ${heights.join(', ')} px`).toBeLessThanOrEqual(112)
      }
      // Y el pie de la vista previa, al pie de la columna, que llega a la barra.
      const box = await boxes(page, { piece: PIECE, caption: `${PIECE} figcaption` })
      expect(box.piece.bottom - box.caption.bottom, `${path}: pie de la columna`).toBeLessThanOrEqual(2)
      expect(box.bar.top - box.piece.bottom, `${path}: hueco bajo la columna`).toBeLessThanOrEqual(BAR_GAP)
    }
  })

  test('RD-VIS-02 e: la 404 estira el panel del subtítulo hasta el pie del pad', async ({ page }) => {
    await open(page, '/esto-no-existe', 'Bonus stage')
    await settle(page)
    const box = await boxes(page, { panel: PANEL, piece: PIECE })
    expect(Math.abs(box.panel.bottom - box.piece.bottom)).toBeLessThanOrEqual(2)
  })

  test('RD-VIS-02 e / §3.8.11: en escritorio, «Volver al menú» de la 404 sigue debajo del pad', async ({
    page,
  }) => {
    await open(page, '/esto-no-existe', 'Bonus stage')
    await settle(page)
    const box = await boxes(page, { pad: 'main figure', back: 'main a[href="/"]' })
    expect(box.back.top).toBeGreaterThanOrEqual(box.pad.bottom)
    expect(box.back.left).toBeLessThan(box.pad.right)
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

for (const viewport of [
  { width: 1440, height: 789 },
  { width: 1366, height: 657 },
]) {
  test.describe(`${viewport.width} × ${viewport.height}`, () => {
    test.use({ viewport })

    for (const { path, heading } of FILL_SCREENS) {
      test(`RD-VIS-02 e: ${path} llena el alto y, si no cabe, se desplaza sin pisar la barra (J2r, J3r)`, async ({
        page,
      }) => {
        await open(page, path, heading)
        await settle(page)
        await scrollToEnd(page)
        const box = await boxes(page, { panel: PANEL, piece: PIECE })
        for (const name of ['panel', 'piece'] as const) {
          expect(box[name].bottom, `pie de «${name}» y barra`).toBeLessThanOrEqual(box.bar.top)
          expect(box.bar.top - box[name].bottom, `hueco bajo «${name}»`).toBeLessThanOrEqual(BAR_GAP)
        }
      })
    }
  })
}

/**
 * ¿Pisa la caja la diagonal de la cuña? La arena de cuña a la izquierda (`ArenaBackdrop`) corta el pie
 * de la ventana en el 30 % del ancho y sube hacia la derecha a 17° de la vertical; el borde derecho de
 * una placa de la cuña, a su pie, no puede pasar de ahí.
 */
async function diagonalAt(page: Page, y: number): Promise<number> {
  const { width, height } = page.viewportSize()!
  return 0.3 * width + (height - y) * Math.tan((17 * Math.PI) / 180)
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]) {
  test.describe(`${viewport.width} × ${viewport.height}, columnas`, () => {
    test.use({ viewport })

    test('RD-VIS-02 e: la columna de «Cómo se juega» queda a la izquierda de la diagonal, también al pie (L1)', async ({
      page,
    }) => {
      await open(page, '/como-funciona', 'Cómo se juega')
      await settle(page)
      const plates = await page.evaluate(
        (selector) =>
          [...document.querySelectorAll(`${selector} ul > li > a`)].map((a) => {
            const rect = a.getBoundingClientRect()
            return { right: rect.right, bottom: rect.bottom }
          }),
        PIECE,
      )
      for (const plate of plates) {
        const diagonal = await diagonalAt(page, plate.bottom)
        expect(plate.right, `placa con pie en ${plate.bottom}`).toBeLessThanOrEqual(diagonal)
      }
    })
  })
}

/**
 * Las pestañas con teclas (§3.3 «Pestañas»): [Q] y [E] a los lados de la fila y, si parte, las líneas
 * entre [Q] y [E], nunca una tecla sola en su línea encima o debajo.
 */
async function tabKeys(page: Page, nav: string) {
  return page.evaluate((selector) => {
    const row = document.querySelector(selector)!
    const keys = [...row.querySelectorAll(':scope > [data-key]')].map((key) => key.getBoundingClientRect())
    const tabs = [...row.querySelectorAll('li, [role="tab"]')].map((tab) => tab.getBoundingClientRect())
    const top = Math.min(...tabs.map((tab) => tab.top))
    const firstLine = tabs.filter((tab) => tab.top < top + 4)
    return {
      q: { left: keys[0]!.left, right: keys[0]!.right, top: keys[0]!.top, bottom: keys[0]!.bottom },
      e: { left: keys[1]!.left, right: keys[1]!.right, top: keys[1]!.top, bottom: keys[1]!.bottom },
      tabsLeft: Math.min(...tabs.map((tab) => tab.left)),
      tabsRight: Math.max(...tabs.map((tab) => tab.right)),
      firstLineTop: top,
      firstLineBottom: Math.max(...firstLine.map((tab) => tab.bottom)),
      lastRight: Math.max(...firstLine.map((tab) => tab.right)),
      lines: new Set(tabs.map((tab) => Math.round(tab.top))).size,
    }
  }, nav)
}

for (const { viewport, path, heading, nav } of [
  {
    viewport: { width: 1440, height: 900 },
    path: '/legal/bases',
    heading: 'Bases de la competición',
    nav: 'main nav[aria-label="Documentos legales"]',
  },
  {
    viewport: { width: 800, height: 900 },
    path: '/ajustes/accesibilidad',
    heading: 'Accesibilidad',
    nav: 'main nav[aria-label="Secciones de ajustes"]',
  },
  {
    viewport: { width: 1440, height: 900 },
    path: '/ajustes',
    heading: 'Sonido y efectos',
    nav: 'main nav[aria-label="Secciones de ajustes"]',
  },
]) {
  test.describe(`${viewport.width} × ${viewport.height}, pestañas`, () => {
    test.use({ viewport })

    test(`§3.3 / RD-VIS-02 e: en ${path}, [Q] y [E] van a los lados de las pestañas, también si parten (L11)`, async ({
      page,
    }) => {
      await open(page, path, heading)
      await settle(page)
      const box = await tabKeys(page, nav)
      // A los lados: [Q] a la izquierda de todas las pestañas y [E] a la derecha de todas.
      expect(box.q.right, 'Q a la izquierda').toBeLessThanOrEqual(box.tabsLeft)
      expect(box.e.left, 'E a la derecha').toBeGreaterThanOrEqual(box.tabsRight)
      // En la primera línea de pestañas, no solas encima o debajo.
      for (const key of [box.q, box.e]) {
        expect(key.top).toBeGreaterThanOrEqual(box.firstLineTop)
        expect(key.bottom).toBeLessThanOrEqual(box.firstLineBottom)
      }
      // En una sola línea, [E] sigue a la última pestaña (no se va al otro lado de la pantalla).
      if (box.lines === 1) expect(box.e.left - box.lastRight).toBeLessThanOrEqual(16)
    })
  })
}

/**
 * Proporción de píxeles de «tinta» en una caja de la pantalla: los que se apartan (más de 48 en algún
 * canal) del color más repetido de la caja, que es su fondo. Una flecha que no se pinta da 0.
 */
async function inkShare(page: Page, box: Box): Promise<number> {
  const png = await page.screenshot({
    clip: { x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top },
  })
  return page.evaluate(async (data) => {
    const image = new Image()
    image.src = `data:image/png;base64,${data}`
    await image.decode()
    const canvas = new OffscreenCanvas(image.width, image.height)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(image, 0, 0)
    const { data: px } = ctx.getImageData(0, 0, image.width, image.height)
    const counts = new Map<number, number>()
    for (let i = 0; i < px.length; i += 4) {
      const key = (px[i]! << 16) | (px[i + 1]! << 8) | px[i + 2]!
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const background = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0]
    const [r, g, b] = [(background >> 16) & 255, (background >> 8) & 255, background & 255]
    let ink = 0
    for (let i = 0; i < px.length; i += 4) {
      if (Math.max(Math.abs(px[i]! - r), Math.abs(px[i + 1]! - g), Math.abs(px[i + 2]! - b)) > 48) ink += 1
    }
    return ink / (px.length / 4)
  }, png.toString('base64'))
}

for (const colorScheme of ['dark', 'light'] as const) {
  test.describe(`contraste alto, esquema ${colorScheme === 'dark' ? 'oscuro' : 'claro'}`, () => {
    test.use({ colorScheme })

    test('RNF-A11Y-01 / RD-VIS-02 e: las flechas ◀ ▶ y ▸ de la vista previa de Opciones se ven (L13a)', async ({
      page,
    }) => {
      await page.emulateMedia({ forcedColors: 'active', colorScheme })
      // Movimiento: conmutadores «◀ NO ▶»; Cuenta: acciones «Cambiar ▸».
      for (const { path, heading, arrows } of [
        { path: '/ajustes/movimiento', heading: 'Movimiento', arrows: 6 },
        { path: '/ajustes/cuenta', heading: 'Cuenta', arrows: 4 },
      ]) {
        await open(page, path, heading)
        await settle(page)
        expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true)
        const boxesOfArrows = await page.evaluate(
          (sel) =>
            [...document.querySelectorAll(`${sel} [data-settings-preview] [data-side]`)].map((arrow) => {
              const rect = arrow.getBoundingClientRect()
              return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }
            }),
          PIECE,
        )
        expect(boxesOfArrows).toHaveLength(arrows)
        for (const box of boxesOfArrows) {
          // El triángulo llena media caja: al menos un cuarto de sus píxeles son tinta.
          const share = await inkShare(page, box)
          expect(share, `${path}: flecha con ${(share * 100).toFixed(0)} % de tinta`).toBeGreaterThanOrEqual(
            0.25,
          )
        }
      }
    })
  })
}

test.describe('1920 × 1080', () => {
  test.use({ viewport: { width: 1920, height: 1080 } })

  for (const { path, heading } of FILL_SCREENS) {
    test(`RD-VIS-02 e: a 1920 × 1080, ${path} llena el ancho, centrada con la placa del HUD (L1)`, async ({
      page,
    }) => {
      await open(page, path, heading)
      await settle(page)
      const box = await boxes(page, {
        panel: PANEL,
        piece: PIECE,
        plate: '.game-frame > header [data-frame="title"]',
      })
      // El bloque de dos columnas va de medianil a medianil (48 px), como el menú: centrado con la placa.
      const gutter = 48
      expect(box.piece.left, 'a la izquierda').toBeLessThanOrEqual(gutter + 1)
      expect(1920 - gutter - box.panel.right, 'a la derecha').toBeLessThanOrEqual(8)
      const center = (box.piece.left + box.panel.right) / 2
      const plateCenter = (box.plate.left + box.plate.right) / 2
      expect(
        Math.abs(center - plateCenter),
        `bloque en ${center}, placa en ${plateCenter}`,
      ).toBeLessThanOrEqual(8)
      // La columna de la pieza crece con la cuña (a 1440 mide 400 px).
      expect(box.piece.right - box.piece.left).toBeGreaterThanOrEqual(500)
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

  test('RD-VIS-02 e / §3.8.11: en móvil, «Volver al menú» de la 404 va al pie del panel, antes del pad, y se ve sin desplazar (L2)', async ({
    page,
  }) => {
    await open(page, '/esto-no-existe', 'Bonus stage')
    await settle(page)
    // En táctil la barra no enseña Esc: la única salida no puede quedar detrás del pad decorativo.
    const back = page.getByRole('main').getByRole('link', { name: 'Volver al menú' })
    const box = await boxes(page, { panel: PANEL, pad: 'main figure', back: 'main a[href="/"]' })
    expect(box.back.top).toBeGreaterThanOrEqual(box.panel.bottom)
    expect(box.back.bottom).toBeLessThanOrEqual(box.pad.top)
    expect(box.back.bottom).toBeLessThanOrEqual(box.bar.top)
    await expect(back).toBeInViewport({ ratio: 1 })
  })

  test('RD-VIS-02 e: en móvil, Opciones abre con su rótulo y su título, antes de las pestañas (L3)', async ({
    page,
  }) => {
    await open(page, '/ajustes', 'Sonido y efectos')
    await settle(page)
    const box = await boxes(page, {
      head: 'main [data-screen-part="head"]',
      tabs: 'main nav[aria-label="Secciones de ajustes"]',
    })
    expect(box.head.bottom).toBeLessThanOrEqual(box.tabs.top)
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeInViewport({ ratio: 1 })
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
