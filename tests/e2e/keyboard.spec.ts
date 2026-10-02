import { expect, type Locator, type Page, test } from '@playwright/test'
import { expectVisibleFocus, open, openGallery } from './support'

/**
 * Recorrido solo con teclado (`RNF-A11Y-01`, guía §2.17): «Saltar al contenido» es lo primero, el foco
 * se ve (anillo rojo de 2 px y halo) en la isla y en los botones, y el menú móvil es un diálogo que
 * atrapa el foco y lo devuelve al cerrarse. Los recorridos de registro, Modo Jurado y subida llegan
 * con sus fases.
 */

/** Pulsa Tab hasta que el foco llegue a `target` (como mucho `max` veces) y devuelve cuántas hicieron falta. */
async function tabTo(page: Page, target: Locator, max = 40): Promise<number> {
  for (let presses = 1; presses <= max; presses++) {
    await page.keyboard.press('Tab')
    if (await target.evaluate((element) => element === document.activeElement)) return presses
  }
  throw new Error(`El foco no llegó al elemento tras ${max} pulsaciones de Tab`)
}

test('RNF-A11Y-01: el primer Tab enseña «Saltar al contenido» y Intro lleva el foco al <main>', async ({
  page,
}) => {
  await open(page, '/', 'Beat Battle')
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Saltar al contenido' })
  await expectVisibleFocus(skip)
  // Fuera de pantalla sin foco; con foco, a la vista y con su tamaño real.
  await expect(skip).toBeInViewport()
  const box = await skip.boundingBox()
  expect(box?.width).toBeGreaterThan(40)

  await page.keyboard.press('Enter')
  await expect(page.getByRole('main')).toBeFocused()
  // El siguiente Tab ya es el contenido (el primer botón del hero), no la isla.
  await page.keyboard.press('Tab')
  await expect(page.getByRole('main').getByRole('link', { name: 'Avísame del próximo drop' })).toBeFocused()
})

test('RNF-A11Y-01: foco visible en la isla, que se recorre en orden y navega con Intro', async ({ page }) => {
  await open(page, '/', 'Beat Battle')
  const island = page.getByRole('banner')
  const nav = island.getByRole('navigation', { name: 'Principal' })

  // Orden: saltar al contenido → logo del sello → enlaces de la isla → «Entrar».
  const logo = island.getByRole('link', { name: /Other People Records/ })
  expect(await tabTo(page, logo)).toBe(2)
  await expectVisibleFocus(logo)

  const order = ['Semana', 'Jurado', 'Resultados', 'Salón de la fama', 'Cómo funciona']
  for (const name of order) {
    await page.keyboard.press('Tab')
    await expectVisibleFocus(nav.getByRole('link', { name, exact: true }))
  }
  await page.keyboard.press('Tab')
  await expectVisibleFocus(island.getByRole('link', { name: 'Entrar', exact: true }))

  // Intro sobre un enlace de la isla navega y deja el foco en el contenido nuevo.
  await page.keyboard.press('Shift+Tab')
  await expect(nav.getByRole('link', { name: 'Cómo funciona', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/como-funciona')
  await expect(page.getByRole('main')).toBeFocused()
})

test('RNF-A11Y-01: foco visible en un botón (pausa del teletipo), que se acciona con Espacio e Intro', async ({
  page,
}) => {
  await open(page, '/', 'Beat Battle')
  const pause = page.getByRole('button', { name: 'Pausar el teletipo' })
  await tabTo(page, pause)
  await expectVisibleFocus(pause)
  await expect(pause).toHaveAttribute('aria-pressed', 'false')
  await page.keyboard.press('Space')
  await expect(pause).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('marquee')).toHaveAttribute('data-paused', 'true')
  await page.keyboard.press('Enter')
  await expect(pause).toHaveAttribute('aria-pressed', 'false')
  await expectVisibleFocus(pause)
})

test('RNF-A11Y-01: foco visible en el botón base de §3.3 (galería), que lo conserva mientras carga', async ({
  page,
}) => {
  await openGallery(page)
  const block = page.locator('section#boton')
  // Los interruptores de la cabecera también son botones con el anillo del sistema.
  const motionSwitch = page.getByRole('switch', { name: /Reducir movimiento/ })
  await tabTo(page, motionSwitch)
  await expectVisibleFocus(motionSwitch)

  // El botón interactivo va justo después del enlace «Ver semanas»: se llega a él con Tab desde ahí.
  await block.getByRole('link', { name: 'Ver semanas' }).focus()
  await page.keyboard.press('Tab')
  // Celda «Interactivo»: el nombre del botón cambia con su estado, la celda no.
  const live = block.getByRole('figure').filter({ hasText: 'Interactivo' }).getByRole('button')
  await expect(live).toHaveAccessibleName('Subir mi beat')
  await expectVisibleFocus(live)

  // Intro lo acciona: mientras carga sigue enfocado (no se deshabilita) y al terminar dice «Subido».
  await page.keyboard.press('Enter')
  await expect(live).toHaveAttribute('aria-busy', 'true')
  await expect(live).toBeFocused()
  await expect(live).toHaveAccessibleName(/^Subido/)
  await expectVisibleFocus(live)
})

const scrollY = (page: Page) => page.evaluate(() => Math.round(window.scrollY))

/**
 * Desde el último enlace del pie, Tab vuelve a empezar por arriba: «Saltar al contenido» y la isla. La
 * isla es sticky y siempre está a la vista, así que enfocarla no debe mover la página (antes, con
 * `scroll-padding-top` en `html`, cada Tab la subía media ventana).
 */
async function tabThroughIslandFromFooter(page: Page, last: Locator, max = 12): Promise<string[]> {
  await page.getByRole('contentinfo').getByRole('link').last().focus()
  const start = await scrollY(page)
  expect(start).toBeGreaterThan(200)
  const visited: string[] = []
  while (!(await last.evaluate((element) => element === document.activeElement))) {
    expect(visited.length, `el foco no llegó tras ${visited.join(' → ')}`).toBeLessThan(max)
    await page.keyboard.press('Tab')
    visited.push(
      await page.evaluate(() => {
        const active = document.activeElement
        return active && active !== document.body
          ? active.textContent?.trim() || active.tagName
          : '(documento)'
      }),
    )
    expect(await scrollY(page), `tras enfocar ${visited.join(' → ')}`).toBe(start)
  }
  return visited
}

test('RNF-A11Y-01: recorrer la isla con Tab desde el pie no desplaza la página', async ({ page }) => {
  await open(page, '/', 'Beat Battle')
  const visited = await tabThroughIslandFromFooter(
    page,
    page.getByRole('banner').getByRole('link', { name: 'Entrar', exact: true }),
  )
  // Pasa por «Saltar al contenido» y los enlaces de la isla antes de «Entrar».
  expect(visited).toEqual(
    expect.arrayContaining(['Saltar al contenido', 'Semana', 'Jurado', 'Cómo funciona']),
  )
  // Mayús+Tab de vuelta por la isla tampoco la mueve.
  const start = await scrollY(page)
  for (let step = 0; step < 6; step++) {
    await page.keyboard.press('Shift+Tab')
    expect(await scrollY(page)).toBe(start)
  }
})

test('RNF-A11Y-01: un control del contenido enfocado bajo el logo que cuelga de la isla se desplaza hasta verse entero', async ({
  page,
}) => {
  await open(page, '/como-funciona', 'Cómo funciona')
  await page.getByRole('contentinfo').scrollIntoViewIfNeeded()
  const link = page.getByRole('main').getByRole('link', { name: 'Bases de la competición' })
  // Deja el enlace a y ≈ 100: por debajo de la isla (85 px) pero bajo el logo (hasta y = 119).
  await link.evaluate((element) => window.scrollBy(0, element.getBoundingClientRect().top - 100))
  expect(Math.round((await link.boundingBox())?.y ?? 0)).toBe(100)
  await link.focus()
  const box = await link.boundingBox()
  // Con su anillo (2 + 2 px) por debajo del logo, y lo que hay en su centro es el propio enlace.
  expect(box?.y ?? 0).toBeGreaterThanOrEqual(123)
  const hit = await link.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const atCenter = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    return atCenter === element || element.contains(atCenter)
  })
  expect(hit).toBe(true)
})

test.describe('móvil (390 × 844)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('RNF-A11Y-01: el menú móvil se abre con teclado, atrapa el foco y lo devuelve al cerrarse con Esc', async ({
    page,
  }) => {
    await open(page, '/', 'Beat Battle')
    const toggle = page.getByRole('banner').getByRole('button', { name: 'Menú' })
    await tabTo(page, toggle)
    await expectVisibleFocus(toggle)

    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Menú' })
    await expect(dialog).toBeVisible()
    const close = dialog.getByRole('button', { name: 'Cerrar el menú' })
    await expect(close).toBeFocused()

    // Tab no sale del diálogo: desde el primero, Mayús+Tab va al último («Entrar») y Tab vuelve al primero.
    await page.keyboard.press('Shift+Tab')
    const signIn = dialog.getByRole('link', { name: 'Entrar', exact: true })
    await expectVisibleFocus(signIn)
    await page.keyboard.press('Tab')
    await expectVisibleFocus(close)

    // Un enlace del panel con su anillo (el del menú lleva su propio estilo de foco).
    await page.keyboard.press('Tab')
    await expect(dialog.getByRole('link', { name: 'Semana' })).toBeFocused()

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expectVisibleFocus(toggle)
  })

  test('RNF-A11Y-01: enfocar el botón «Menú» desde el pie no desplaza la página', async ({ page }) => {
    await open(page, '/como-funciona', 'Cómo funciona')
    const visited = await tabThroughIslandFromFooter(
      page,
      page.getByRole('banner').getByRole('button', { name: 'Menú' }),
    )
    expect(visited).toContain('Saltar al contenido')
  })

  test('RNF-A11Y-01: un enlace enfocado bajo el logo centrado se desplaza hasta verse entero', async ({
    page,
  }) => {
    await open(page, '/como-funciona', 'Cómo funciona')
    await page.getByRole('contentinfo').scrollIntoViewIfNeeded()
    const link = page.getByRole('main').getByRole('link', { name: 'Bases de la competición' })
    // A y ≈ 80: por debajo de la isla (70 px) pero bajo el logo (hasta y = 117).
    await link.evaluate((element) => window.scrollBy(0, element.getBoundingClientRect().top - 80))
    await link.focus()
    expect((await link.boundingBox())?.y ?? 0).toBeGreaterThanOrEqual(121)
    const hit = await link.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const atCenter = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      return atCenter === element || element.contains(atCenter)
    })
    expect(hit).toBe(true)
  })
})
