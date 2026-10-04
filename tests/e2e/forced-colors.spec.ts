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

/** El color del lienzo (`Canvas`) tal y como lo resuelve el navegador en el modo forzado. */
function canvasColor(page: Page) {
  return page.evaluate(() => {
    const probe = document.createElement('span')
    probe.style.cssText = 'position:absolute;forced-color-adjust:none;background:Canvas'
    document.body.append(probe)
    const color = getComputedStyle(probe).backgroundColor
    probe.remove()
    return color
  })
}

/** El cursor de juego de `item` se ve y no es del color del lienzo. */
async function expectRingVisible(page: Page, item: Locator) {
  await expect(item).toBeFocused()
  const ring = item.locator(':scope > [data-cursor-ring]')
  await expect(ring).toBeVisible()
  const canvas = await canvasColor(page)
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
  const canvas = await canvasColor(page)
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
  const canvas = await canvasColor(page)
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
  const canvas = await canvasColor(page)
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
