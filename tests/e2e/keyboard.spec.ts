import { expect, type Locator, type Page, test } from '@playwright/test'
import { expectCursor, expectVisibleFocus, open, openGallery } from './support'

/**
 * Recorridos con teclado (`RNF-A11Y-01`, `RD-VIS-02` d y `RD-MOT-05`; guía §2.17, §3.3 y §3.10):
 * «Saltar al contenido» es lo primero; las pantallas son menús de juego que se recorren con flechas,
 * Intro y Esc, con una sola parada de tabulación por grupo y el foco visto como el cursor de juego; lo
 * demás lleva el foco genérico (contorno blanco con halo rojo).
 */

/** Pulsa Tab hasta que el foco llegue a `target` (como mucho `max` veces) y devuelve cuántas hicieron falta. */
async function tabTo(page: Page, target: Locator, max = 40): Promise<number> {
  for (let presses = 1; presses <= max; presses++) {
    await page.keyboard.press('Tab')
    if (await target.evaluate((element) => element === document.activeElement)) return presses
  }
  throw new Error(`El foco no llegó al elemento tras ${max} pulsaciones de Tab`)
}

const menu = (page: Page) => page.getByRole('main').getByRole('menu', { name: 'Elige modo' })
const plate = (page: Page, name: string) => menu(page).getByRole('menuitem', { name: new RegExp(`^${name}`) })

test('RNF-A11Y-01: el primer Tab enseña «Saltar al contenido» y Intro lleva el foco al <main>', async ({
  page,
}) => {
  await open(page, '/', 'Beat Battle')
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Saltar al contenido' })
  await expectVisibleFocus(skip)
  await expect(skip).toBeInViewport()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('main')).toBeFocused()
})

test('RD-VIS-02 d / RD-MOT-05: el menú principal se recorre como un menú de juego (una parada, flechas en bucle, Intro y Esc)', async ({
  page,
}) => {
  await open(page, '/', 'Beat Battle')
  // Al entrar, el cursor está en la primera opción disponible (Jugar está deshabilitado: Jurado), sin
  // robar el foco.
  await expect(plate(page, 'Jurado')).toHaveAttribute('data-cursor-active', 'true')
  await expect(page.locator('body')).toBeFocused()

  // Con el foco en ningún control, las flechas van al menú.
  await page.keyboard.press('ArrowDown')
  await expectCursor(plate(page, 'Resultados'))
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await expectCursor(plate(page, 'Jugar'))
  // En bucle, Fin e Inicio.
  await page.keyboard.press('ArrowUp')
  await expectCursor(plate(page, 'Ajustes'))
  await page.keyboard.press('Home')
  await expectCursor(plate(page, 'Jugar'))
  await page.keyboard.press('End')
  await expectCursor(plate(page, 'Ajustes'))
  // El panel de ayuda describe la opción del cursor.
  await expect(page.getByRole('navigation').locator('[aria-live="polite"]')).toContainText(
    'Sonido, movimiento',
  )

  // Una sola parada de tabulación: Tab sale del menú.
  const items = menu(page).getByRole('menuitem')
  await expect(items.and(page.locator('[tabindex="0"]'))).toHaveCount(1)
  await page.keyboard.press('Tab')
  await expect(items.and(page.locator(':focus'))).toHaveCount(0)

  // Letra inicial: «C» salta a «Cómo se juega»; Intro entra.
  await page.keyboard.press('Shift+Tab')
  await expectCursor(plate(page, 'Ajustes'))
  await page.keyboard.press('c')
  await expectCursor(plate(page, 'Cómo se juega'))
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/como-funciona')
  await expect(page.getByRole('main')).toBeFocused()

  // Esc vuelve al menú.
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL('/')
  await expect(menu(page)).toBeVisible()
})

test('RD-VIS-02 d / RD-MOT-05: una opción deshabilitada se recorre pero no entra', async ({ page }) => {
  await open(page, '/', 'Beat Battle')
  await page.keyboard.press('Home')
  const play = plate(page, 'Jugar')
  await expectCursor(play)
  await expect(play).toHaveAttribute('aria-disabled', 'true')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/')
})

test('RD-VIS-02 d: una pantalla interior se recorre con teclado y enseña sus teclas; Esc y «Volver al menú» vuelven', async ({
  page,
}) => {
  await open(page, '/ajustes/cuenta', 'Cuenta')
  const keys = page.getByRole('contentinfo').getByRole('list', { name: 'Controles' })
  await expect(keys.getByRole('listitem')).toHaveText([/Q\s*E\s*Sección/i, /Esc\s*Volver/i, /M\s*Sonido/i])

  // Q/E cambian de sección (Opciones, §3.8.14).
  await page.keyboard.press('e')
  await expect(page).toHaveURL('/ajustes/perfil')
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('Perfil')
  await page.keyboard.press('q')
  await expect(page).toHaveURL('/ajustes/cuenta')

  // Tab llega a las pestañas (cursor de juego) y a «Volver al menú» (cursor del botón), que vuelve.
  const tab = page
    .getByRole('navigation', { name: 'Secciones de ajustes' })
    .getByRole('link', { name: 'Cuenta' })
  await tabTo(page, tab)
  await expectCursor(tab)
  const back = page.getByRole('main').getByRole('link', { name: /Volver al menú/ })
  await tabTo(page, back)
  await expectCursor(back)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/')

  // Y Esc, desde cualquier pantalla interior.
  await open(page, '/salon-de-la-fama', 'Salón de la fama')
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL('/')
})

test('RD-VIS-02 d: Q/E recorren las ocho secciones de Opciones en el orden de §3.8.14 y dan la vuelta', async ({
  page,
}) => {
  await page.goto('/ajustes')
  await expect(page).toHaveURL('/ajustes/sonido')
  const sections = [
    ['sonido', 'Sonido y efectos'],
    ['movimiento', 'Movimiento'],
    ['cuenta', 'Cuenta'],
    ['perfil', 'Perfil'],
    ['emails', 'Emails'],
    ['sesiones', 'Sesiones'],
    ['privacidad', 'Privacidad'],
    ['accesibilidad', 'Accesibilidad'],
  ] as const
  const heading = page.getByRole('main').getByRole('heading', { level: 1 })
  await expect(heading).toHaveText(sections[0][1])
  for (const [slug, title] of [...sections.slice(1), sections[0]]) {
    await page.keyboard.press('e')
    await expect(page).toHaveURL(`/ajustes/${slug}`)
    await expect(heading).toHaveText(title)
  }
  await page.keyboard.press('q')
  await expect(page).toHaveURL('/ajustes/accesibilidad')
})

test('RD-VIS-02 d / RD-MOT-05: «Cómo se juega» es una lista de movimientos que se recorre como un menú de juego', async ({
  page,
}) => {
  await open(page, '/como-funciona', 'Cómo se juega')
  const moves = page.getByRole('main').getByRole('menu', { name: 'Lista de movimientos' })
  const items = moves.getByRole('menuitem')
  await expect(items).toHaveCount(5)
  await expect(items.and(page.locator('[tabindex="0"]'))).toHaveCount(1)
  // La barra enseña las teclas del menú.
  const keys = page.getByRole('contentinfo').getByRole('list', { name: 'Controles' })
  await expect(keys.getByRole('listitem')).toHaveText([
    /Elegir/i,
    /Intro\s*Entrar/i,
    /Esc\s*Volver/i,
    /M\s*Sonido/i,
  ])

  // Con el foco en ningún control, las flechas van a la lista; el cursor lleva la etiqueta 1P.
  await page.keyboard.press('ArrowDown')
  await expectCursor(items.nth(1))
  await expect(items.nth(1).locator('[data-cursor-player]')).toBeVisible()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await expectCursor(items.nth(4))
  await expect(items.nth(4)).toHaveAccessibleName('Volver al menú')
  await page.keyboard.press('Home')
  await expectCursor(items.first())

  // B abre las bases desde la pantalla; Esc vuelve al menú.
  await page.keyboard.press('b')
  await expect(page).toHaveURL('/legal/bases')
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL('/')

  // Intro entra en el movimiento elegido.
  await open(page, '/como-funciona', 'Cómo se juega')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expectCursor(items.nth(2))
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/jurado')
})

test('RNF-A11Y-01: foco genérico visible en los enlaces del marco (la firma del sello y «Legal»)', async ({
  page,
}) => {
  await open(page, '/como-funciona', 'Cómo se juega')
  const signature = page
    .getByRole('contentinfo')
    .getByRole('link', { name: /Un juego de Other People Records/ })
  await tabTo(page, signature)
  await expectVisibleFocus(signature)
  await page.keyboard.press('Tab')
  await expectVisibleFocus(page.getByRole('contentinfo').getByRole('link', { name: 'Legal' }))
})

test('RD-SND-06: M enciende y apaga el sonido desde cualquier pantalla, también con el foco en el menú', async ({
  page,
}) => {
  await open(page, '/', 'Beat Battle')
  const sound = page.getByRole('banner').getByRole('button', { name: 'Sonido de efectos (M)' })
  await expect(sound).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('m')
  await expect(sound).toHaveAttribute('aria-pressed', 'false')
  await page.keyboard.press('m')
  await expect(sound).toHaveAttribute('aria-pressed', 'true')
})

test('RNF-A11Y-08 / WCAG 2.1.4: los atajos de una tecla se apagan en Opciones → Accesibilidad y la preferencia se queda', async ({
  page,
}) => {
  await open(page, '/ajustes/accesibilidad', 'Accesibilidad')
  const toggle = page.getByRole('main').getByRole('button', { name: /Atajos de una tecla/ })
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')

  // En «Cómo se juega», con el foco fuera de la lista: ni M ni B hacen nada (queda el botón de sonido).
  await open(page, '/como-funciona', 'Cómo se juega')
  const sound = page.getByRole('banner').getByRole('button', { name: 'Sonido de efectos' })
  await expect(sound).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('main').focus()
  await page.keyboard.press('m')
  await page.keyboard.press('b')
  await expect(page).toHaveURL('/como-funciona')
  await expect(sound).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('contentinfo').getByRole('list', { name: 'Controles' })).not.toContainText(
    'Sonido',
  )
  // Con el foco en la lista de movimientos, B sí (es su grupo).
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('b')
  await expect(page).toHaveURL('/legal/bases')
})

test('RD-MOT-05: la rejilla y las pestañas de la galería tienen una parada y se recorren con flechas y Q/E', async ({
  page,
}) => {
  await openGallery(page)
  const grid = page.getByRole('listbox', { name: 'Entradas de muestra' })
  const cells = grid.getByRole('option')
  await cells.first().focus()
  await expectCursor(cells.first())
  await page.keyboard.press('ArrowDown')
  await expectCursor(cells.nth(4))
  await page.keyboard.press('ArrowLeft')
  await expectCursor(cells.nth(3))
  await expect(cells.and(page.locator('[tabindex="0"]'))).toHaveCount(1)

  const tablist = page.locator('section#pestanas').getByRole('tablist').first()
  const tabs = tablist.getByRole('tab')
  await tabs.first().focus()
  await page.keyboard.press('ArrowRight')
  await expectCursor(tabs.nth(1))
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true')
})

test('RNF-A11Y-01: la ventana de juego atrapa el foco, Esc la cierra y el foco vuelve al botón', async ({
  page,
}) => {
  await openGallery(page)
  const trigger = page.getByRole('button', { name: 'Abrir ventana' })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: '¿Salir del Modo Jurado?' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toBeFocused()
  for (let step = 0; step < 6; step++) {
    await page.keyboard.press('Tab')
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  // Esc en la ventana no saca de la pantalla.
  await expect(page).toHaveURL(/\/dev\/galeria/)
})
