import { expect, type Page, test } from '@playwright/test'
import { expectCursor, open, settle } from './support'

/**
 * Composición de las pantallas interiores (guía §3.8.14, §3.8.11; `RD-VIS-02` e: pases del jurado visual
 * de la tarea 0.28). La plantilla (`ScreenPage`) reparte la pantalla como fija la v0.6.6 («Reparto del
 * alto»):
 *
 * - **Autenticación** como pantalla de título: el logo con su lockup y el panel, centrados en vertical
 *   entre el HUD y la barra, con el pie del panel a la altura del lockup; en móvil, el panel anclado al
 *   pie, encima de la barra.
 * - **Pantallas de poco contenido** («Cómo se juega», Opciones, la 404, los legales y las provisionales):
 *   no estiran cajas para llenar el alto. El bloque de dos columnas (pieza y panel, del mismo alto) se
 *   centra en vertical entre el HUD y la barra, con filas densas (nombre en display y una línea, como las
 *   de `05-perfil`: ninguna pasa de 72 px) y las acciones al pie del panel; a 1920, de medianil a
 *   medianil, centrado con la placa del HUD (L1). Las pestañas no entran en el centrado: van fijas
 *   arriba, a la misma altura en todas las secciones, y el bloque se centra en el hueco de debajo.
 * - **404 en móvil**: el subtítulo va con el titular, antes del pad, y se ve sin desplazar, y «Volver al
 *   menú» va antes del pad (L2).
 * - **Pestañas**: [Q] y [E] a los lados, también cuando parten (L11).
 * - **Granate de la cuña** en todas las secciones de Opciones y en los legales, con su pieza encima,
 *   dentro del rango de las maquetas (§3.1: «unos 15 %»; como mucho el 24,5 % de `02-seleccion` en
 *   escritorio y el 18 % de las maquetas móviles) y con un punto de margen (L-granate), con el criterio
 *   del acta del jurado (grupo 24): r 25–110, g < 0,45 r, b < 0,6 r.
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

/**
 * Las pantallas de Opciones (sus ocho secciones) y los cuatro legales: el granate de la cuña se mide en
 * todas (tercer pase del jurado: Sesiones, Privacidad y Accesibilidad estaban a 0,2 puntos del techo sin
 * test). Los legales van en el marco simple, sin cuña.
 */
const WINE_SCREENS = [
  ...['sonido', 'movimiento', 'cuenta', 'perfil', 'emails', 'sesiones', 'privacidad', 'accesibilidad'].map(
    (section) => `/ajustes/${section}`,
  ),
  ...['bases', 'terminos', 'privacidad', 'cookies'].map((doc) => `/legal/${doc}`),
]

/**
 * Proporción de píxeles granate de una captura (criterio del acta, grupo 24), medida en el navegador. Con
 * `rows`, la de esa franja de filas de la ventana (`[desde, hasta)`, en px).
 */
async function wineShare(page: Page, rows?: readonly [number, number]): Promise<number> {
  const png = await page.screenshot()
  return page.evaluate(
    async ({ data, rows }) => {
      const image = new Image()
      image.src = `data:image/png;base64,${data}`
      await image.decode()
      const canvas = new OffscreenCanvas(image.width, image.height)
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(image, 0, 0)
      const [from, to] = rows ?? [0, image.height]
      const top = Math.max(0, Math.round(from))
      const height = Math.min(image.height, Math.round(to)) - top
      const { data: px } = ctx.getImageData(0, top, image.width, height)
      let wine = 0
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i]!
        if (r >= 25 && r <= 110 && px[i + 1]! < 0.45 * r && px[i + 2]! < 0.6 * r) wine += 1
      }
      return wine / (px.length / 4)
    },
    { data: png.toString('base64'), rows },
  )
}

/**
 * Las interiores de poco contenido (§3.8.14 «Reparto del alto»): «Cómo se juega», Opciones (con la
 * sección de más filas, Sonido, y las de menos), la 404 y una provisional.
 */
const FEW_SCREENS = [
  { path: '/como-funciona', heading: 'Cómo se juega' },
  { path: '/ajustes/sonido', heading: 'Sonido y efectos' },
  { path: '/ajustes/accesibilidad', heading: 'Accesibilidad' },
  { path: '/ajustes/sesiones', heading: 'Sesiones' },
  { path: '/ajustes/privacidad', heading: 'Privacidad' },
  { path: '/esto-no-existe', heading: 'Bonus stage' },
  { path: '/legal/bases', heading: 'Bases de la competición' },
  { path: '/semanas', heading: 'Semanas' },
]

/** Alto máximo de una fila densa (§3.8.14: nombre en display y una línea, «unos 56–72 px»). */
const ROW_MAX = 72

/**
 * El bloque de dos columnas de la pantalla (pieza y panel) y sus márgenes: el de arriba, con el HUD o,
 * si hay pestañas, con ellas (van fijas arriba y no entran en el centrado, §3.8.14), y el de abajo, con
 * la barra. Centrado, se parecen (el `<main>` deja 24 px arriba y 32 abajo; las pestañas, 24 debajo).
 */
async function block(page: Page) {
  const box = await boxes(page, { panel: PANEL, piece: PIECE })
  const tabs = await page.evaluate(
    () => document.querySelector('main [data-screen-part="tabs"]')?.getBoundingClientRect().bottom ?? null,
  )
  const top = Math.min(box.piece.top, box.panel.top)
  const bottom = Math.max(box.piece.bottom, box.panel.bottom)
  return { ...box, top, bottom, above: top - (tabs ?? box.hud.bottom), below: box.bar.top - bottom }
}

/** Altos de las filas de la pantalla: las del panel (reglas, ayuda, leyenda) y las placas de la cuña. */
async function rowHeights(page: Page): Promise<number[]> {
  return page.evaluate(
    ([panel, piece]) =>
      [...document.querySelectorAll(`${panel} section li, ${piece} figure li`)].map((row) =>
        Math.round(row.getBoundingClientRect().height),
      ),
    [PANEL, PIECE],
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

  for (const { path, heading } of FEW_SCREENS) {
    test(`RD-VIS-02 e: ${path} no estira cajas: centra el bloque entre el HUD y la barra, con la pieza y el panel del mismo alto (§3.8.14)`, async ({
      page,
    }) => {
      await open(page, path, heading)
      await settle(page)
      const box = await block(page)
      // Centrado: los márgenes de arriba y de abajo se parecen (y no es un bloque estirado hasta la barra).
      expect(
        Math.abs(box.above - box.below),
        `arriba ${box.above} px · abajo ${box.below} px`,
      ).toBeLessThanOrEqual(24)
      expect(box.below, 'hueco bajo el bloque').toBeGreaterThanOrEqual(40)
      // La pieza y el panel, del mismo alto (la fila los iguala; las acciones, al pie del panel).
      expect(
        Math.abs(box.piece.bottom - box.panel.bottom),
        'pies de la pieza y del panel',
      ).toBeLessThanOrEqual(2)
      expect(Math.abs(box.piece.top - box.panel.top), 'cabezas de la pieza y del panel').toBeLessThanOrEqual(
        2,
      )
    })

    test(`RD-VIS-02 e: en ${path} ninguna fila pasa de ${ROW_MAX} px: nombre y una línea, como las de 05-perfil (§3.8.14)`, async ({
      page,
    }) => {
      await open(page, path, heading)
      await settle(page)
      const heights = await rowHeights(page)
      for (const height of heights)
        expect(height, `filas de ${heights.join(', ')} px`).toBeLessThanOrEqual(ROW_MAX)
    })
  }

  test('RD-VIS-02 e: las reglas de «Cómo se juega» y la ayuda y las placas de Opciones llevan su nombre en display (§3.8.14)', async ({
    page,
  }) => {
    for (const { path, heading, name } of [
      { path: '/como-funciona', heading: 'Cómo se juega', name: `${PANEL} section li .bb-display` },
      { path: '/ajustes/sonido', heading: 'Sonido y efectos', name: `${PANEL} section li .bb-display` },
      { path: '/ajustes/sonido', heading: 'Sonido y efectos', name: `${PIECE} figure li .bb-display` },
    ]) {
      await open(page, path, heading)
      await settle(page)
      const fonts = await page.evaluate(
        (selector) =>
          [...document.querySelectorAll(selector)].map((element) => {
            const style = getComputedStyle(element)
            return { family: style.fontFamily, size: Number.parseFloat(style.fontSize) }
          }),
        name,
      )
      expect(fonts.length, `${path}: nombres en display`).toBeGreaterThanOrEqual(4)
      for (const font of fonts) {
        expect(font.family, path).toMatch(/Anybody/)
        expect(font.size, path).toBeGreaterThanOrEqual(16)
      }
    }
  })

  test('RD-VIS-02 e: en Opciones, el nombre de cada placa de la vista previa no pesa menos que su valor (§3.8.14)', async ({
    page,
  }) => {
    for (const { path, heading } of [
      { path: '/ajustes/movimiento', heading: 'Movimiento' },
      { path: '/ajustes/cuenta', heading: 'Cuenta' },
    ]) {
      await open(page, path, heading)
      await settle(page)
      const sizes = await page.evaluate(
        (selector) =>
          [...document.querySelectorAll(`${selector} figure li`)].map((row) => {
            const [label, value] = [...row.children].map((child) =>
              Number.parseFloat(getComputedStyle(child).fontSize),
            )
            return { label: label!, value: value! }
          }),
        PIECE,
      )
      for (const size of sizes) expect(size.label, path).toBeGreaterThanOrEqual(size.value)
    }
  })

  for (const path of WINE_SCREENS) {
    test(`§3.1 / RD-VIS-02 e: la cuña de ${path} no pasa del granate de las maquetas (≤ 24,5 %, L-granate)`, async ({
      page,
    }) => {
      await page.goto(path)
      await expect(page.locator(PIECE)).toBeVisible()
      await settle(page)
      const share = await wineShare(page)
      test.info().annotations.push({ type: 'granate', description: `${path}: ${(share * 100).toFixed(2)} %` })
      // Techo de las maquetas (24,5 %) con un punto de margen: a 0,2 puntos (Sesiones, Privacidad y
      // Accesibilidad, en el tercer pase) cualquier cambio de letra o de ventana lo pasaría.
      expect(share, `granate ${(share * 100).toFixed(1)} %`).toBeLessThanOrEqual(0.235)
    })
  }
})

/**
 * Ventana baja (§3.8.14, como el menú en §3.8.3): con ≥ 721 px de ancho y < 900 de alto las interiores
 * de poco contenido se aprietan por altura (filas, separaciones y el pad a 56 px) sin esconder nada. A
 * 1366 × 657 y 1440 × 789 (la ventana real de una pantalla de 1440 × 900) caben sin desplazar y la barra
 * no tapa ningún control.
 */
const LOW_SCREENS = [
  { path: '/como-funciona', heading: 'Cómo se juega' },
  { path: '/ajustes/sonido', heading: 'Sonido y efectos' },
  { path: '/ajustes/accesibilidad', heading: 'Accesibilidad' },
  { path: '/esto-no-existe', heading: 'Bonus stage' },
]

for (const viewport of [
  { width: 1366, height: 657 },
  { width: 1440, height: 789 },
]) {
  test.describe(`${viewport.width} × ${viewport.height}, ventana baja`, () => {
    test.use({ viewport })

    for (const { path, heading } of LOW_SCREENS) {
      test(`RD-VIS-02 e: ${path} cabe sin desplazar y la barra no tapa ningún control (§3.8.14)`, async ({
        page,
      }) => {
        await open(page, path, heading)
        await settle(page)
        const fit = await page.evaluate(() => {
          const bar = document.querySelector('.game-frame > footer')!.getBoundingClientRect()
          const visible = (element: Element) => {
            const rect = element.getBoundingClientRect()
            return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden'
          }
          const controls = [...document.querySelectorAll('main :is(a[href], button, [tabindex="0"])')].filter(
            visible,
          )
          return {
            overflow: document.documentElement.scrollHeight - window.innerHeight,
            covered: controls
              .filter((control) => control.getBoundingClientRect().bottom > bar.top + 0.5)
              .map((control) => control.textContent?.trim()),
            // Nada escondido: todas las filas y los párrafos de la pantalla se pintan.
            hidden: [...document.querySelectorAll('main :is(li, p)')]
              .filter((element) => !element.closest('.sr-only, [data-screen-part="head"]'))
              .filter((element) => !visible(element))
              .map((element) => element.textContent?.trim()),
          }
        })
        expect(fit.overflow, `${fit.overflow} px de desplazamiento`).toBeLessThanOrEqual(0)
        expect(fit.covered, 'controles bajo la barra').toEqual([])
        expect(fit.hidden, 'filas o párrafos escondidos').toEqual([])
      })
    }
  })
}

/**
 * Las pestañas de Opciones y de los legales van fijas arriba (§3.8.14: solo se centra el bloque de dos
 * columnas): al cambiar de sección con Q/E, la fila no salta y la pestaña nueva, con el foco, se queda
 * donde estaba. Con todo el bloque centrado (revisión de la 0.28), la fila bajaba o subía hasta 71 px
 * entre secciones y, con el ratón, el puntero se quedaba fuera de las pestañas.
 */
const TAB_SCREENS = [
  {
    name: 'Opciones',
    nav: 'Secciones de ajustes',
    paths: [
      'sonido',
      'movimiento',
      'cuenta',
      'perfil',
      'emails',
      'sesiones',
      'privacidad',
      'accesibilidad',
    ].map((section) => `/ajustes/${section}`),
  },
  {
    name: 'los legales',
    nav: 'Documentos legales',
    paths: ['bases', 'terminos', 'privacidad', 'cookies'].map((doc) => `/legal/${doc}`),
  },
]

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1366, height: 657 },
]) {
  test.describe(`${viewport.width} × ${viewport.height}, pestañas fijas`, () => {
    test.use({ viewport })

    for (const { name, nav, paths } of TAB_SCREENS) {
      test(`RD-VIS-02 e: en ${name}, la fila de pestañas no salta al cambiar de sección con E (§3.8.14)`, async ({
        page,
      }) => {
        const row = page.getByRole('navigation', { name: nav })
        await page.goto(paths[0]!)
        const tops: number[] = []
        for (const [index, path] of paths.entries()) {
          if (index > 0) await page.keyboard.press('e')
          await expect(page).toHaveURL(path)
          await expect(row.locator('a[aria-current="page"]')).toHaveAttribute('href', path)
          await settle(page)
          tops.push(Math.round((await row.boundingBox())!.y))
        }
        expect(new Set(tops).size, `arriba de la fila: ${tops.join(', ')} px`).toBe(1)
      })
    }
  })
}

/**
 * Los legales (§3.8.14 «Admin y legales», v0.6.6) usan la plantilla de las interiores: el sello «EN
 * OBRAS» en la columna de la pieza, centrado en ella, el bloque centrado entre el HUD y la barra y las
 * pestañas en una fila de rótulos cortos, con el nombre completo en el título del panel.
 */
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1366, height: 657 },
  { width: 1024, height: 768 },
]) {
  test.describe(`${viewport.width} × ${viewport.height}, legales`, () => {
    test.use({ viewport })

    test('RD-VIS-02 e: /legal/bases usa la plantilla de las interiores: sello en la columna de la pieza, bloque centrado y pestañas cortas en una fila (§3.8.14)', async ({
      page,
    }) => {
      await open(page, '/legal/bases', 'Bases de la competición')
      await settle(page)
      const box = await block(page)
      expect(
        Math.abs(box.above - box.below),
        `arriba ${box.above} px · abajo ${box.below} px`,
      ).toBeLessThanOrEqual(24)
      expect(
        Math.abs(box.piece.bottom - box.panel.bottom),
        'pieza y panel, del mismo alto',
      ).toBeLessThanOrEqual(2)
      // El sello, dentro de la columna de la pieza y centrado en ella.
      const stamp = await boxes(page, { stamp: `${PIECE} [data-stamp]` })
      const pieceMiddle = (box.piece.top + box.piece.bottom) / 2
      const stampMiddle = (stamp.stamp.top + stamp.stamp.bottom) / 2
      expect(Math.abs(pieceMiddle - stampMiddle), 'sello centrado en vertical').toBeLessThanOrEqual(8)
      expect(stamp.stamp.left).toBeGreaterThanOrEqual(box.piece.left)
      expect(stamp.stamp.right).toBeLessThanOrEqual(box.piece.right + 8)
      // Las pestañas: rótulos cortos en una fila, con [E] justo después de la última.
      const nav = 'main nav[aria-label="Documentos legales"]'
      const tabs = page.locator(`${nav} a`)
      await expect(tabs).toHaveText(['Bases', 'Términos', 'Privacidad', 'Cookies'])
      const keys = await tabKeys(page, nav)
      expect(keys.lines, 'pestañas en una fila').toBe(1)
      expect(keys.e.left - keys.lastRight).toBeLessThanOrEqual(16)
      // El nombre completo, en el título del panel (el <h1>).
      await expect(page.locator(`${PANEL} h1`)).toHaveText('Bases de la competición')
      await expect(page.locator(`${PANEL} h1`)).toBeVisible()
    })
  })
}

/**
 * La 404 en escritorio (§3.8.11, v0.6.6): «Volver al menú [Esc]» va justo debajo del pad y su nota, a
 * `--bb-space-5` (20 px), alineado con el pad: no al pie de la columna, como un botón suelto.
 */
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]) {
  test.describe(`${viewport.width} × ${viewport.height}, 404`, () => {
    test.use({ viewport })

    test('RD-VIS-02 e / §3.8.11: «Volver al menú» va justo debajo del pad y su nota, alineado con el pad', async ({
      page,
    }) => {
      await open(page, '/esto-no-existe', 'Bonus stage')
      await settle(page)
      const box = await boxes(page, {
        pad: 'main figure',
        caption: 'main figure figcaption',
        back: 'main a[href="/"]',
      })
      const gap = box.back.top - box.caption.bottom
      expect(gap, `${gap} px entre la nota del pad y el botón`).toBeGreaterThanOrEqual(16)
      expect(gap, `${gap} px entre la nota del pad y el botón`).toBeLessThanOrEqual(24)
      expect(Math.abs(box.back.left - box.pad.left), 'alineado con el pad').toBeLessThanOrEqual(2)
    })

    test('RD-VIS-02 e: los filetes de las filas de «Cuando llegue el pad» llegan, como el de la lista, al borde del panel', async ({
      page,
    }) => {
      await open(page, '/esto-no-existe', 'Bonus stage')
      await settle(page)
      const edges = await page.evaluate((panel) => {
        const list = document.querySelector(`${panel} section ul`)!.getBoundingClientRect()
        return {
          list: list.right,
          rows: [...document.querySelectorAll(`${panel} section li`)].map(
            (row) => row.getBoundingClientRect().right,
          ),
        }
      }, PANEL)
      expect(edges.rows).toHaveLength(3)
      for (const right of edges.rows)
        expect(
          Math.abs(right - edges.list),
          `fila hasta ${right}, lista hasta ${edges.list}`,
        ).toBeLessThanOrEqual(1)
    })
  })
}

/**
 * Teclado de recreativa en las interiores sin menú propio (§3.8.14, v0.6.6): al cargar, el primer
 * elemento de juego lleva el cursor sin robar el foco (la pestaña actual en Opciones y en los legales,
 * «Volver al menú» en la 404 y en las provisionales, la autenticación incluida); con el foco en ningún
 * control, ↑↓ e Intro van a él y lo marcan con el cursor. Intro no lo acciona: lo hace la siguiente, ya
 * con el foco en él. El primer Tab sigue siendo «Saltar al contenido».
 */
for (const { path, heading, start, enter } of [
  {
    path: '/ajustes/sonido',
    heading: 'Sonido y efectos',
    start: 'Sonido y efectos',
    enter: '/ajustes/sonido',
  },
  {
    path: '/legal/bases',
    heading: 'Bases de la competición',
    start: 'Bases de la competición',
    enter: '/legal/bases',
  },
  { path: '/esto-no-existe', heading: 'Bonus stage', start: 'Volver al menú', enter: '/' },
  { path: '/entrar', heading: 'Entrar', start: 'Volver al menú', enter: '/' },
  { path: '/registro', heading: 'Crear cuenta', start: 'Volver al menú', enter: '/' },
]) {
  test(`RD-VIS-02 d: en ${path}, el cursor empieza en «${start}» y ↑↓ e Intro van a él (sin accionarlo) con el foco en ningún control (§3.8.14)`, async ({
    page,
  }) => {
    await open(page, path, heading)
    const target = page.getByRole('main').getByRole('link', { name: start, exact: true })
    // Al cargar: el cursor en el primer elemento de juego, sin robarle el foco a la página.
    await expect(page.locator('body')).toBeFocused()
    await expect(target.locator(':scope > [data-cursor-ring]')).toBeVisible()
    await expect(page.getByRole('main').locator('[data-cursor-ring]:visible')).toHaveCount(1)
    // ↓ y ↑ con el foco en ningún control van a él.
    await page.keyboard.press('ArrowDown')
    await expectCursor(target)
    await page.getByRole('main').focus()
    await page.keyboard.press('ArrowUp')
    await expectCursor(target)
    // Intro, con el foco en ningún control, lo enfoca sin accionarlo; la siguiente, ya en él, lo acciona.
    await page.getByRole('main').focus()
    await page.keyboard.press('Enter')
    await expectCursor(target)
    await expect(page).toHaveURL(path)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(enter)
    // El primer Tab de una carga nueva sigue siendo «Saltar al contenido».
    await open(page, path, heading)
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeFocused()
  })
}

/**
 * Intro no rebota entre pantallas (revisión de la 0.28): al cambiar de pantalla el foco va al `<main>`,
 * que cuenta como reposo. Si Intro accionara el primer elemento de juego, dos Intro seguidas desde el
 * menú volvían al menú; y con la tecla mantenida, sus repeticiones entraban en la opción elegida de la
 * pantalla nueva («Pilla el sample», en «Cómo se juega», lleva al menú) y rebotaban entre pantallas
 * unas diez veces por segundo. Desde el menú, el cursor está en «Jurado», que sin sesión lleva a
 * «/entrar».
 */
test('RD-VIS-02 d: dos Intro seguidas desde el menú se quedan en la pantalla nueva (la segunda solo lleva el cursor a «Volver al menú», §3.8.14)', async ({
  page,
}) => {
  await open(page, '/', 'Beat Battle')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/entrar')
  await expect(page.getByRole('main')).toBeFocused()
  await page.keyboard.press('Enter')
  await expectCursor(page.getByRole('main').getByRole('link', { name: 'Volver al menú', exact: true }))
  await page.waitForTimeout(300)
  await expect(page).toHaveURL('/entrar')
})

for (const { name, select, enter } of [
  { name: 'Jurado (en reposo)', select: [] as string[], enter: '/entrar' },
  { name: 'Cómo se juega', select: ['End', 'ArrowUp'], enter: '/como-funciona' },
]) {
  test(`RD-VIS-02 d: Intro mantenida en «${name}» entra una sola vez y no vuelve al menú`, async ({
    page,
  }) => {
    await open(page, '/', 'Beat Battle')
    for (const key of select) await page.keyboard.press(key)
    const visited: string[] = []
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) visited.push(new URL(frame.url()).pathname)
    })
    // La tecla mantenida: repeticiones cada 35 ms durante ~1 s.
    await page.keyboard.down('Enter')
    await expect(page).toHaveURL(enter)
    for (let repeat = 0; repeat < 30; repeat++) {
      await page.keyboard.down('Enter')
      await page.waitForTimeout(35)
    }
    await page.keyboard.up('Enter')
    await page.waitForTimeout(300)
    await expect(page).toHaveURL(enter)
    expect(
      visited.filter((path) => path !== enter),
      `recorrido: ${visited.join(' → ')}`,
    ).toEqual([])
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

/*
 * Con la ventana baja de 1024 × 768 la columna de la pieza baja a 18 rem (el pad, a 56 px por tecla,
 * cabe): con 20 rem, las placas del pie de «Cómo se juega» pisaban la diagonal 18 px y el tablero de
 * Opciones, 10 (revisión de la 0.28).
 */
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 1280, height: 720 },
  { width: 1024, height: 768 },
]) {
  test.describe(`${viewport.width} × ${viewport.height}, columnas`, () => {
    test.use({ viewport })

    for (const { path, heading, boxes: selector } of [
      { path: '/como-funciona', heading: 'Cómo se juega', boxes: 'ul > li > a' },
      { path: '/ajustes/sonido', heading: 'Sonido y efectos', boxes: 'figure' },
      { path: '/esto-no-existe', heading: 'Bonus stage', boxes: 'figure, a' },
    ]) {
      test(`RD-VIS-02 e: la columna de ${path} queda a la izquierda de la diagonal, también al pie (L1)`, async ({
        page,
      }) => {
        await open(page, path, heading)
        await settle(page)
        const plates = await page.evaluate(
          ([piece, inner]) =>
            [...document.querySelectorAll(`${piece} :is(${inner})`)].map((a) => {
              const rect = a.getBoundingClientRect()
              return { right: rect.right, bottom: rect.bottom }
            }),
          [PIECE, selector] as const,
        )
        expect(plates.length).toBeGreaterThan(0)
        for (const plate of plates) {
          const diagonal = await diagonalAt(page, plate.bottom)
          expect(plate.right, `caja con pie en ${plate.bottom}`).toBeLessThanOrEqual(diagonal)
        }
      })
    }
  })
}

/**
 * Las placas en vista previa de Opciones (§3.8.14, como las del menú en §3.3 «Nada se corta»): el nombre
 * no pasa de dos líneas y todas las placas de un tablero miden lo mismo, sin pasar de 72 px. En un
 * tablero estrecho, el nombre cede su anchura y el medidor baja a una segunda línea (a 1280 × 720 y a
 * 1024 × 768, «TAMAÑO / DE / TEXTO» partía en tres).
 */
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1366, height: 657 },
  { width: 1280, height: 900 },
  { width: 1280, height: 720 },
  { width: 1024, height: 768 },
  { width: 961, height: 900 },
]) {
  test.describe(`${viewport.width} × ${viewport.height}, vista previa de Opciones`, () => {
    test.use({ viewport })

    test('RD-VIS-02 e: el nombre de cada placa en vista previa ocupa como mucho dos líneas y las placas miden lo mismo (§3.8.14)', async ({
      page,
    }) => {
      const sections = TAB_SCREENS[0]!.paths
      await page.goto(sections[0]!)
      for (const [index, path] of sections.entries()) {
        if (index > 0) await page.keyboard.press('e')
        await expect(page).toHaveURL(path)
        await expect(
          page.getByRole('navigation', { name: TAB_SCREENS[0]!.nav }).locator('a[aria-current="page"]'),
        ).toHaveAttribute('href', path)
        await settle(page)
        const plates = await page.evaluate(
          (piece) =>
            [...document.querySelectorAll(`${piece} figure li`)].map((plate) => {
              const label = plate.firstElementChild!
              const range = document.createRange()
              range.selectNodeContents(label)
              return {
                label: label.textContent ?? '',
                lines: new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size,
                height: Math.round(plate.getBoundingClientRect().height),
              }
            }),
          PIECE,
        )
        const summary = plates
          .map((plate) => `${plate.label}: ${plate.lines} l, ${plate.height} px`)
          .join(' · ')
        expect(plates.length, path).toBeGreaterThanOrEqual(2)
        for (const plate of plates) expect(plate.lines, `${path}: ${summary}`).toBeLessThanOrEqual(2)
        expect(new Set(plates.map((plate) => plate.height)).size, `${path}: ${summary}`).toBe(1)
        expect(plates[0]!.height, `${path}: ${summary}`).toBeLessThanOrEqual(ROW_MAX)
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
 * Pestañas en una ventana estrecha con teclado (§3.3 «Pestañas», v0.6.6): la etiqueta que no cabe en la
 * columna del centro de `[Q] · pestañas · [E]` parte en dos líneas (44 px como poco) y ninguna pestaña
 * queda bajo una tecla. Se prueba con las etiquetas de la pantalla y con una larga a propósito en la
 * pestaña elegida (el componente tiene que aguantarla aunque hoy los rótulos sean cortos).
 */
async function tabsUnderKeys(page: Page, nav: string): Promise<string[]> {
  return page.evaluate((selector) => {
    const row = document.querySelector(selector)!
    const [q, e] = [...row.querySelectorAll(':scope > [data-key]')].map((key) => key.getBoundingClientRect())
    const overlaps = (a: DOMRect, b: DOMRect) =>
      a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
    return [...row.querySelectorAll('a')]
      .map((tab) => ({ tab, rect: tab.getBoundingClientRect() }))
      .filter(
        ({ rect }) =>
          overlaps(rect, q!) || overlaps(rect, e!) || rect.right > e!.left || rect.left < q!.right,
      )
      .map(({ tab, rect }) => `${tab.textContent} (${Math.round(rect.left)}–${Math.round(rect.right)})`)
  }, nav)
}

for (const viewport of [
  { width: 320, height: 568 },
  { width: 360, height: 640 },
]) {
  test.describe(`pestañas a ${viewport.width} px con teclado`, () => {
    test.use({ viewport })

    for (const { path, heading, nav } of [
      {
        path: '/legal/bases',
        heading: 'Bases de la competición',
        nav: 'main nav[aria-label="Documentos legales"]',
      },
      { path: '/ajustes', heading: 'Sonido y efectos', nav: 'main nav[aria-label="Secciones de ajustes"]' },
    ]) {
      test(`RD-VIS-05 / §3.3: en ${path}, ninguna pestaña queda bajo [Q] o [E]; la que no cabe parte en dos líneas`, async ({
        page,
      }) => {
        await open(page, path, heading)
        await settle(page)
        expect(await tabsUnderKeys(page, nav)).toEqual([])
        // Una etiqueta larga en la pestaña elegida: parte en líneas dentro de su columna, a 44 px o más.
        const tab = page.locator(`${nav} a[aria-current="page"]`)
        await tab.evaluate((element) => {
          element.lastChild!.textContent = 'Bases de la competición y otras letras pequeñas'
        })
        expect(await tabsUnderKeys(page, nav)).toEqual([])
        const lines = await tab.evaluate((element) => {
          const range = document.createRange()
          range.selectNodeContents(element.lastChild!)
          return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size
        })
        expect(lines, 'la etiqueta larga parte en líneas').toBeGreaterThanOrEqual(2)
        const box = (await tab.boundingBox())!
        expect(box.height, 'objetivo de 44 px').toBeGreaterThanOrEqual(44)
        expect(box.x + box.width, 'dentro de la ventana').toBeLessThanOrEqual(viewport.width)
      })
    }
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

  for (const { path, heading } of [
    { path: '/entrar', heading: 'Entrar' },
    { path: '/registro', heading: 'Crear cuenta' },
  ]) {
    test(`RD-VIS-02 e: a 1920 × 1080, el panel de ${path} tiene el ancho acotado y el bloque va centrado con la placa (§3.8.14)`, async ({
      page,
    }) => {
      await open(page, path, heading)
      await settle(page)
      const box = await boxes(page, {
        title: 'main [data-title-piece]',
        panel: PANEL,
        plate: '.game-frame > header [data-frame="title"]',
      })
      // Acotado (36 rem): con una línea de texto, el panel no se estira a lo que quede (984 px).
      expect(box.panel.right - box.panel.left, 'ancho del panel').toBeLessThanOrEqual(576)
      const center = (box.title.left + box.panel.right) / 2
      const plateCenter = (box.plate.left + box.plate.right) / 2
      expect(
        Math.abs(center - plateCenter),
        `bloque en ${center}, placa en ${plateCenter}`,
      ).toBeLessThanOrEqual(8)
    })
  }

  for (const { path, heading } of FEW_SCREENS) {
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

  for (const { path, heading, nav, kicker, title, tab } of [
    {
      path: '/ajustes/sonido',
      heading: 'Sonido y efectos',
      nav: 'Secciones de ajustes',
      kicker: 'Opciones',
      title: 'Ajustes',
      tab: 'Sonido y efectos',
    },
    {
      path: '/legal/bases',
      heading: 'Bases de la competición',
      nav: 'Documentos legales',
      kicker: 'Legal',
      title: 'Letra pequeña',
      tab: 'Bases',
    },
  ]) {
    test(`RD-VIS-02 e: en móvil, ${path} abre con el rótulo y el título de la placa («${kicker} · ${title}»), antes de las pestañas, sin repetir la elegida (L3, §3.8.14)`, async ({
      page,
    }) => {
      await open(page, path, heading)
      await settle(page)
      const head = page.locator('main [data-screen-part="head"]')
      await expect(head).toBeInViewport({ ratio: 1 })
      await expect(head).toHaveText(new RegExp(`^${kicker}\\s*${title}$`, 'i'))
      const box = await boxes(page, {
        head: 'main [data-screen-part="head"]',
        tabs: `main nav[aria-label="${nav}"]`,
      })
      expect(box.head.bottom).toBeLessThanOrEqual(box.tabs.top)
      // La pestaña elegida nombra la sección; la cabeza no la repite.
      await expect(head).not.toContainText(tab)
      await expect(page.getByRole('navigation', { name: nav }).locator('a[aria-current="page"]')).toHaveText(
        tab,
      )
    })
  }

  for (const path of WINE_SCREENS) {
    test(`§3.1 / RD-VIS-02 e: en móvil, la cuña de ${path} no pasa del granate de las maquetas (≤ 18 %, L-granate)`, async ({
      page,
    }) => {
      await page.goto(path)
      await expect(page.locator(PIECE)).toBeVisible()
      await settle(page)
      const share = await wineShare(page)
      test.info().annotations.push({ type: 'granate', description: `${path}: ${(share * 100).toFixed(2)} %` })
      // Techo de las maquetas móviles (18 %) con un punto de margen.
      expect(share, `granate ${(share * 100).toFixed(1)} %`).toBeLessThanOrEqual(0.17)
    })
  }
})

/**
 * «Volver al menú» de la 404 en móvil (§3.8.11 v0.6.7; L2 y cuarto pase del jurado, P2): en táctil la barra
 * no enseña Esc y es la única salida, así que se ve sin desplazar. En móvil va al pie del panel, antes del
 * pad decorativo; en el móvil bajo (≤ 700 px de alto) sube justo después del resumen, antes de la leyenda
 * (a 375 × 667 quedaba en 687–735 con la barra en 569, y a 320 × 568, en 732–780 con la barra en 470). La
 * colocación es de CSS: el orden del DOM no cambia (titular, subtítulo, resumen, leyenda, pad y botón).
 */
for (const viewport of [
  { width: 390, height: 844, low: false },
  { width: 375, height: 667, low: true },
  { width: 360, height: 640, low: true },
  { width: 320, height: 568, low: true },
]) {
  test.describe(`404 a ${viewport.width} × ${viewport.height} táctil`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, isMobile: true, hasTouch: true })

    test(`RD-VIS-02 e / §3.8.11: en móvil, «Volver al menú» de la 404 va ${viewport.low ? 'justo después del resumen, antes de la leyenda' : 'al pie del panel'} y del pad, y se ve sin desplazar (L2, P2)`, async ({
      page,
    }) => {
      await open(page, '/esto-no-existe', 'Bonus stage')
      await settle(page)
      const back = page.getByRole('main').getByRole('link', { name: 'Volver al menú' })
      const box = await boxes(page, {
        panel: PANEL,
        summary: `${PANEL} > p:nth-of-type(2)`,
        legend: `${PANEL} section`,
        pad: 'main figure',
        back: 'main a[href="/"]',
      })
      if (viewport.low) {
        expect(box.back.top, 'después del resumen').toBeGreaterThanOrEqual(box.summary.bottom)
        expect(box.back.bottom, 'antes de la leyenda').toBeLessThanOrEqual(box.legend.top)
      } else expect(box.back.top, 'al pie del panel').toBeGreaterThanOrEqual(box.panel.bottom)
      expect(box.back.bottom, 'antes del pad').toBeLessThanOrEqual(box.pad.top)
      expect(box.back.bottom, `botón hasta ${box.back.bottom}, barra en ${box.bar.top}`).toBeLessThanOrEqual(
        box.bar.top,
      )
      await expect(back).toBeInViewport({ ratio: 1 })
      expect(await page.evaluate(() => scrollY)).toBe(0)
    })
  })
}

/**
 * Opciones por debajo de 360 px (§3.8.14 v0.6.7; cuarto pase del jurado, P3): las ocho pestañas ocupan
 * cinco o seis filas y la vista previa baja fuera de la primera vista, así que detrás de las pestañas
 * quedaba la cuña desnuda con su trama (granate de la primera vista: 25,4 % con teclado y 20,4 % en táctil
 * en Sonido; 24,6 y 19,6 en Privacidad). La cuña empieza bajo las pestañas: ningún granate a su altura, y
 * el de la primera vista dentro del de las maquetas móviles (≤ 18 %, con un punto de margen).
 */
for (const touch of [false, true]) {
  test.describe(`Opciones a 320 × 568 ${touch ? 'en táctil' : 'con teclado'}`, () => {
    test.use({ viewport: { width: 320, height: 568 }, isMobile: touch, hasTouch: touch })

    for (const path of ['/ajustes', '/ajustes/privacidad']) {
      test(`§3.1 / §3.8.14 / RD-VIS-02 e: en ${path}, la cuña empieza bajo las pestañas y el granate no pasa del de las maquetas móviles (≤ 18 %, P3)`, async ({
        page,
      }) => {
        await page.goto(path)
        await expect(page.locator(PIECE)).toBeAttached()
        await settle(page)
        const tabs = await page.evaluate(() => {
          const box = document.querySelector('main [data-screen-part="tabs"]')!.getBoundingClientRect()
          return [box.top, box.bottom] as const
        })
        const behindTabs = await wineShare(page, tabs)
        expect(behindTabs, `granate a la altura de las pestañas: ${(behindTabs * 100).toFixed(2)} %`).toBe(0)
        const share = await wineShare(page)
        test
          .info()
          .annotations.push({ type: 'granate', description: `${path}: ${(share * 100).toFixed(2)} %` })
        expect(share, `granate ${(share * 100).toFixed(1)} %`).toBeLessThanOrEqual(0.17)
      })
    }
  })
}
