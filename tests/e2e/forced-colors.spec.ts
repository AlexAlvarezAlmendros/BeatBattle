import { expect, type Locator, type Page, test } from '@playwright/test'
import { open, openGallery } from './support'

/**
 * Contraste alto de Windows (`forced-colors: active`, `RNF-A11Y-01`, guía §2.17 y §3.3): el navegador
 * cambia los colores por los del sistema y quita los fondos de color, así que el cursor de juego (un
 * anillo pintado con `background`) desaparecería negro sobre negro. En ese modo el anillo se pinta con
 * `Highlight` (no se deja adaptar) y los marcos, el medidor y la barra de la semana usan colores del
 * sistema; el número gigante de la cuña, que es texto transparente con contorno, se quita.
 */

test.use({ colorScheme: 'dark' })

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' })
})

/** Color de fondo calculado de un elemento o de un pseudoelemento. */
function background(locator: Locator, pseudo?: '::before' | '::after') {
  return locator.evaluate(
    (element, which) => getComputedStyle(element, which ?? null).backgroundColor,
    pseudo,
  )
}

/**
 * Un color del sistema (`Canvas`, `CanvasText`, `Highlight`…) tal y como lo resuelve el navegador en el
 * modo forzado: el fondo de una sonda que el modo no adapta.
 */
function systemColor(page: Page, name: string) {
  return page.evaluate((keyword) => {
    const probe = document.createElement('span')
    probe.style.cssText = `position:absolute;forced-color-adjust:none;background:${keyword}`
    document.body.append(probe)
    const color = getComputedStyle(probe).backgroundColor
    probe.remove()
    return color
  }, name)
}

/** El cursor de juego de `item` se ve y no es del color del lienzo. */
async function expectRingVisible(page: Page, item: Locator) {
  await expect(item).toBeFocused()
  const ring = item.locator(':scope > [data-cursor-ring]')
  await expect(ring).toBeVisible()
  const canvas = await systemColor(page, 'Canvas')
  expect(await background(ring)).not.toBe(canvas)
  expect(await ring.evaluate((element) => getComputedStyle(element).forcedColorAdjust)).toBe('none')
}

test('RNF-A11Y-01: en contraste alto, el cursor de juego del menú se ve (Highlight, no negro sobre negro)', async ({
  page,
}) => {
  await open(page, '/dev/menu', 'Beat Battle')
  expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true)
  await page.keyboard.press('ArrowDown')
  const plate = page
    .getByRole('main')
    .getByRole('menu', { name: 'Elige modo' })
    .getByRole('menuitem', { name: /^Jurado/ })
  await expectRingVisible(page, plate)
  // Red de seguridad: el contorno del foco también se ve (no es `none`).
  expect(await plate.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid')
})

test('RNF-A11Y-01: en contraste alto, las pestañas de Opciones y las de la galería enseñan el cursor', async ({
  page,
}) => {
  await open(page, '/ajustes/cuenta', 'Cuenta')
  const link = page
    .getByRole('navigation', { name: 'Secciones de ajustes' })
    .getByRole('link', { name: 'Cuenta' })
  await link.focus()
  await expectRingVisible(page, link)

  await openGallery(page)
  const tabs = page.locator('section#pestanas').getByRole('tablist').first().getByRole('tab')
  await tabs.first().focus()
  await page.keyboard.press('ArrowRight')
  await expectRingVisible(page, tabs.nth(1))
})

test('RNF-A11Y-01: en contraste alto, los marcos, el medidor de XP y la barra de la semana se ven; el número gigante se quita', async ({
  page,
}) => {
  await open(page, '/dev/menu', 'Beat Battle')
  const canvas = await systemColor(page, 'Canvas')
  // El borde de un marco (la capa `::before` recortada en chaflán).
  const frame = page.getByRole('main').locator('[data-frame]').first()
  expect(await background(frame, '::before')).not.toBe(canvas)
  // El relleno del medidor de XP del HUD y un segmento de la barra de la semana.
  const meterFill = page.getByRole('banner').locator('[data-meter-fill]').first()
  expect(await background(meterFill)).not.toBe(canvas)
  const segment = page.getByRole('banner').locator('[data-week-segment]').first()
  expect(await background(segment)).not.toBe(canvas)
  // El número de semana gigante (texto transparente con contorno) no se pinta como un bloque.
  await expect(page.locator('[data-giant-number]')).toBeHidden()
})

/** Fondos de las dos casillas «SÍ | NO» de un chip de filtro (en ese orden). */
function yesNo(chip: Locator) {
  return chip
    .locator('[aria-hidden="true"] > span')
    .evaluateAll((spans) => spans.map((span) => getComputedStyle(span).backgroundColor))
}

test('RNF-A11Y-01: en contraste alto, el conmutador «SÍ | NO» enseña su estado (Opciones → Accesibilidad y la galería)', async ({
  page,
}) => {
  await open(page, '/ajustes/accesibilidad', 'Accesibilidad')
  const canvas = await systemColor(page, 'Canvas')
  const toggle = page.getByRole('main').getByRole('button', { name: /Atajos de una tecla/ })
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  // Encendido: «SÍ» resaltada (no del color del lienzo) y «NO» no.
  const on = await yesNo(toggle)
  expect(on[0]).not.toBe(canvas)
  expect(on[0]).not.toBe(on[1])
  // Apagado: el resaltado pasa a «NO».
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  const off = await yesNo(toggle)
  expect(off).toEqual([on[1], on[0]])

  // En la galería, el chip activo se distingue del de reposo también por el borde.
  await openGallery(page)
  const block = page.locator('#chip-filtro')
  const rest = block.locator('[data-state="rest"] button[aria-pressed="false"]')
  const active = block.locator('button[aria-pressed="true"]:not([data-force-state])')
  expect(await yesNo(active)).toEqual(on)
  expect(await yesNo(rest)).toEqual(off)
  expect(await background(active, '::before')).not.toBe(await background(rest, '::before'))
})

/**
 * Los interruptores de la galería («Reducir movimiento», «Modo serio»; `role="switch"`) marcaban su estado
 * solo con fondos, y en contraste alto «SÍ» y «NO» se veían iguales (tercer pase del jurado, L5). Como el
 * chip de filtro: la casilla elegida en `Highlight` y el borde del encendido en `Highlight`.
 */
test('RNF-A11Y-01: en contraste alto, los interruptores de la galería enseñan su estado («SÍ | NO» y el borde)', async ({
  page,
}) => {
  await openGallery(page)
  const canvas = await systemColor(page, 'Canvas')
  const serious = page.getByRole('switch', { name: /Modo serio/ })
  await expect(serious).toHaveAttribute('aria-checked', 'false')
  // Apagado: «NO» resaltada (no del color del lienzo) y «SÍ» no.
  const off = await yesNo(serious)
  expect(off[1]).not.toBe(canvas)
  expect(off[1]).not.toBe(off[0])
  const offBorder = await background(serious, '::before')
  // Encendido: el resaltado pasa a «SÍ» y el borde cambia.
  await serious.click()
  await expect(serious).toHaveAttribute('aria-checked', 'true')
  expect(await yesNo(serious)).toEqual([off[1], off[0]])
  expect(await background(serious, '::before')).not.toBe(offBorder)
  // El otro interruptor, apagado, enseña lo mismo que el primero antes de encenderlo.
  const reduced = page.getByRole('switch', { name: /Reducir movimiento/ })
  await expect(reduced).toHaveAttribute('aria-checked', 'false')
  expect(await yesNo(reduced)).toEqual(off)
})

/**
 * La etiqueta girada del anunciador es un paralelogramo de fondo (`Tag`): el modo quita el fondo y el
 * recorte se comería un borde, así que quedaba texto girado suelto (tercer pase del jurado). En contraste
 * alto conserva su caja: sin recorte y con borde `CanvasText`.
 */
test('RNF-A11Y-01: en contraste alto, la etiqueta girada del anunciador conserva su caja (borde CanvasText)', async ({
  page,
}) => {
  await openGallery(page)
  const canvasText = await systemColor(page, 'CanvasText')
  const tag = page.locator('section#anunciador [data-announcer="tag"] [data-tag]')
  await tag.scrollIntoViewIfNeeded()
  const box = await tag.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      clipPath: style.clipPath,
      borders: [style.borderTop, style.borderRight, style.borderBottom, style.borderLeft].map((border) =>
        border.replace(/^[\d.]+px/, (width) => (Number.parseFloat(width) > 0 ? 'ancho' : '0')),
      ),
    }
  })
  expect(box.clipPath).toBe('none')
  expect(box.borders).toEqual(Array(4).fill(`ancho solid ${canvasText}`))
})

/** Las etiquetas visibles de `scope`: su texto, si es la 1P del cursor, su recorte, sus bordes y su tamaño. */
function tagBoxes(page: Page, scope: string) {
  return page.locator(`${scope} [data-tag]`).evaluateAll((tags) =>
    tags
      .filter((tag) => tag.getBoundingClientRect().width > 0)
      .map((tag) => {
        const style = getComputedStyle(tag)
        const box = tag.getBoundingClientRect()
        return {
          text: tag.textContent ?? '',
          cursor: tag.matches('[data-cursor-player]'),
          clipPath: style.clipPath,
          borders: [style.borderTop, style.borderRight, style.borderBottom, style.borderLeft].map((border) =>
            border.replace(/^[\d.]+px/, (width) => (Number.parseFloat(width) > 0 ? 'ancho' : '0')),
          ),
          size: `${box.width.toFixed(1)} × ${box.height.toFixed(1)}`,
        }
      }),
  )
}

/**
 * Todas las etiquetas (`Tag`, §3.3 v0.6.6: «las etiquetas conservan su caja con borde `CanvasText`»): el
 * arreglo de la ronda anterior estaba solo en el anunciador, y en contraste alto las demás (1P, NUEVO,
 * RETO, EN JUEGO…) perdían el fondo y quedaban como texto suelto (`/dev/menu`). Ahora la caja es de
 * `tag.css`: sin recorte y con borde `CanvasText`; la 1P del cursor, con borde `Highlight`. Mide lo mismo
 * que sin contraste alto: el borde se come el relleno.
 */
test('RNF-A11Y-01: en contraste alto, todas las etiquetas conservan su caja (borde CanvasText; la 1P del cursor, Highlight), en /dev/menu y en la galería', async ({
  page,
}) => {
  await open(page, '/dev/menu', 'Beat Battle')
  const [canvasText, highlight] = await Promise.all(
    ['CanvasText', 'Highlight'].map((name) => systemColor(page, name)),
  )
  const check = (tags: Awaited<ReturnType<typeof tagBoxes>>) => {
    for (const tag of tags) {
      expect(tag.clipPath, `«${tag.text}»: recorte`).toBe('none')
      expect(tag.borders, `«${tag.text}»: borde`).toEqual(
        Array(4).fill(`ancho solid ${tag.cursor ? highlight : canvasText}`),
      )
    }
  }
  // El cursor en una placa, para que se vea su 1P.
  await page.keyboard.press('ArrowDown')
  const menu = await tagBoxes(page, 'main')
  expect(menu.map((tag) => tag.text)).toEqual(expect.arrayContaining(['1P', 'Reto', 'Nuevo']))
  check(menu)

  // Las primitivas de la galería: los tres tonos en los tres tamaños, y sin cambiar de tamaño.
  await openGallery(page)
  const scope = 'section#base-primitivas'
  await page.locator(scope).scrollIntoViewIfNeeded()
  const forced = await tagBoxes(page, scope)
  expect(forced.length).toBeGreaterThanOrEqual(9)
  check(forced)
  await page.emulateMedia({ forcedColors: 'none' })
  expect((await tagBoxes(page, scope)).map((tag) => tag.size)).toEqual(forced.map((tag) => tag.size))
})

/**
 * El medidor (§3.3; el de las opciones, la barra de XP) pintaba en contraste alto la pista en `GrayText` y
 * el relleno en `Highlight`: en el esquema claro, azul marino y rojo oscuro, casi iguales sobre blanco
 * (tercer pase del jurado, L13b). Ahora se distinguen por la forma: los segmentos vacíos son solo un borde
 * `CanvasText` sin relleno (la pista, `Canvas`, con su contorno y los huecos en `CanvasText`) y los
 * llenos, macizos en `Highlight`.
 */
test.describe('esquema claro', () => {
  test.use({ colorScheme: 'light' })

  /** Cómo pinta cada medidor de `scope`: pista, contorno (estilo, color y si tiene ancho), huecos y relleno. */
  function meters(page: Page, scope: string) {
    return page.locator(`${scope} :is([role="meter"], [role="progressbar"])`).evaluateAll((tracks) =>
      tracks.map((track) => {
        const style = getComputedStyle(track)
        const fill = track.querySelector('[data-meter-fill]')!
        return {
          track: style.backgroundColor,
          clipPath: style.clipPath,
          ring: `${style.outlineStyle} ${style.outlineColor} ${Number.parseFloat(style.outlineWidth) > 0}`,
          gaps: getComputedStyle(track, '::after').backgroundImage,
          fill: getComputedStyle(fill).backgroundColor,
          filled: fill.getBoundingClientRect().width > 0,
        }
      }),
    )
  }

  test('RNF-A11Y-01: en contraste alto, el medidor distingue los segmentos llenos (Highlight) de los vacíos (solo borde), en Opciones y en la galería', async ({
    page,
  }) => {
    await open(page, '/ajustes/accesibilidad', 'Accesibilidad')
    expect(await page.evaluate(() => matchMedia('(prefers-color-scheme: light)').matches)).toBe(true)
    const [canvas, canvasText, highlight] = await Promise.all(
      ['Canvas', 'CanvasText', 'Highlight'].map((name) => systemColor(page, name)),
    )
    const check = (found: Awaited<ReturnType<typeof meters>>) => {
      expect(found.length).toBeGreaterThan(0)
      for (const meter of found) {
        // Vacíos: sin relleno (el lienzo) y con borde: el contorno de la pista y los huecos, en CanvasText.
        expect(meter.track).toBe(canvas)
        expect(meter.clipPath).toBe('none')
        expect(meter.ring).toBe(`solid ${canvasText} true`)
        expect(meter.gaps).toContain(canvasText)
        // Llenos: macizos en Highlight.
        expect(meter.filled).toBe(true)
        expect(meter.fill).toBe(highlight)
      }
    }
    check(await meters(page, 'main'))

    await openGallery(page)
    await page.locator('section#medidor').scrollIntoViewIfNeeded()
    check(await meters(page, 'section#medidor'))
  })
})
