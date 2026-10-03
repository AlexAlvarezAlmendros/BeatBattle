import { expect, type Page, test } from '@playwright/test'
import { collectErrors } from './support'

/**
 * Navegación por el marco de juego (tareas 0.23, 0.24 y 0.26; guía §2.18, §3.4.1 y §3.8.3): el menú
 * principal lleva a cada modo, Esc y «Volver al menú» vuelven, el historial del navegador funciona, la
 * posición se recupera donde toca y la 404 «BONUS STAGE» sale dentro del marco.
 */

const mainHeading = (page: Page) => page.getByRole('main').getByRole('heading', { level: 1 })
const plate = (page: Page, name: string) =>
  page.getByRole('menu', { name: 'Elige modo' }).getByRole('menuitem', { name: new RegExp(`^${name}`) })

test.describe('escritorio (1440 × 900)', () => {
  test('el menú lleva a cada modo disponible: URL, <h1>, título, placa del HUD y foco en el contenido', async ({
    page,
  }) => {
    const errors = collectErrors(page)
    const modes = [
      { name: 'Jurado', path: '/entrar', heading: 'Entrar', title: 'Entrar', plate: 'Continuar partida' },
      {
        name: 'Salón de la fama',
        path: '/salon-de-la-fama',
        heading: 'Salón de la fama',
        title: 'Salón de la fama',
        plate: 'Tabla de récords',
      },
      {
        name: 'Cómo se juega',
        path: '/como-funciona',
        heading: 'Cómo se juega',
        title: 'Cómo se juega',
        plate: 'Lista de movimientos',
      },
      {
        name: 'Ajustes',
        path: '/ajustes/cuenta',
        heading: 'Cuenta',
        title: 'Cuenta · Ajustes',
        plate: 'Opciones',
      },
    ]
    for (const mode of modes) {
      await page.goto('/')
      await plate(page, mode.name).click()
      await expect(page).toHaveURL(mode.path)
      await expect(mainHeading(page)).toHaveText(mode.heading)
      await expect(page).toHaveTitle(`${mode.title} · Beat Battle`)
      await expect(page.getByRole('banner').locator('[data-frame="title"]')).toContainText(mode.plate)
      await expect(page.getByRole('main')).toBeFocused()
    }
    expect(errors).toEqual([])
  })

  test('Jugar y Resultados, deshabilitados con el calendario vacío, no llevan a ningún sitio', async ({
    page,
  }) => {
    await page.goto('/')
    // `aria-disabled`: Playwright no hace clic en lo deshabilitado salvo que se le fuerce, como un usuario.
    await plate(page, 'Jugar').click({ force: true })
    await plate(page, 'Resultados').click({ force: true })
    await expect(page).toHaveURL('/')
  })

  test('«Volver al menú» y el historial del navegador recorren las pantallas', async ({ page }) => {
    await page.goto('/')
    await plate(page, 'Salón de la fama').click()
    await expect(mainHeading(page)).toHaveText('Salón de la fama')
    await page
      .getByRole('main')
      .getByRole('link', { name: /Volver al menú/ })
      .click()
    await expect(page).toHaveURL('/')
    await page.goBack()
    await expect(page).toHaveURL('/salon-de-la-fama')
    await page.goBack()
    await expect(page).toHaveURL('/')
    await page.goForward()
    await expect(mainHeading(page)).toHaveText('Salón de la fama')
  })

  test('§3.6: al cambiar de pantalla entra con su transición; la primera carga no se anima', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.locator('.game-screen')).not.toHaveAttribute('data-entering')
    await plate(page, 'Cómo se juega').click()
    await expect(page.locator('.game-screen')).toHaveAttribute('data-entering', 'true')
  })
})

/** Desplazamiento vertical tras dos fotogramas (lo que tarde `ScrollRestoration` en aplicarse). */
const scrollYAfterPaint = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((done) =>
        requestAnimationFrame(() => requestAnimationFrame(() => done(Math.round(window.scrollY)))),
      ),
  )

test.describe('desplazamiento al cargar (móvil, donde las pantallas interiores se desplazan)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('una carga nueva en la misma pestaña empieza arriba aunque la anterior estuviera desplazada', async ({
    page,
  }) => {
    await page.goto('/como-funciona')
    await expect(mainHeading(page)).toHaveText('Cómo se juega')
    await page.getByRole('contentinfo').scrollIntoViewIfNeeded()
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100)

    await page.goto('/esto-no-existe')
    await expect(mainHeading(page)).toHaveText('Página no encontrada')
    expect(await scrollYAfterPaint(page)).toBe(0)
  })

  test('recargar y volver atrás desde otro documento recuperan la posición', async ({ page }) => {
    await page.goto('/como-funciona')
    await expect(mainHeading(page)).toHaveText('Cómo se juega')
    await page.getByRole('contentinfo').scrollIntoViewIfNeeded()
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100)
    const position = Math.round(await page.evaluate(() => window.scrollY))

    await page.reload()
    await expect(mainHeading(page)).toHaveText('Cómo se juega')
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(position)

    await page.goto('/semanas')
    await expect(mainHeading(page)).toHaveText('Semanas')
    await page.goBack()
    await expect(mainHeading(page)).toHaveText('Cómo se juega')
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(position)
  })

  test('en móvil, un toque en una placa entra', async ({ page }) => {
    await page.goto('/')
    await plate(page, 'Cómo se juega').tap()
    await expect(page).toHaveURL('/como-funciona')
  })
})

test.describe('404', () => {
  test('una ruta que no existe pinta «BONUS STAGE» dentro del marco, con vuelta al menú', async ({
    page,
  }) => {
    const errors = collectErrors(page)
    await page.goto('/esto-no-existe')
    await expect(mainHeading(page)).toHaveText('Página no encontrada')
    await expect(page).toHaveTitle('Página no encontrada · Beat Battle')
    await expect(page.getByRole('banner').locator('[data-frame="title"]')).toContainText('Bonus stage')
    await expect(page.getByRole('contentinfo')).toBeVisible()
    await page
      .getByRole('main')
      .getByRole('link', { name: /Volver al menú/ })
      .click()
    await expect(page).toHaveURL('/')
    expect(errors).toEqual([])
  })

  test('un documento legal que no existe también es 404 (loader de /legal/:doc), con su placa', async ({
    page,
  }) => {
    await page.goto('/legal/no-existe')
    await expect(mainHeading(page)).toHaveText('Página no encontrada')
    await expect(page.getByRole('banner').locator('[data-frame="title"]')).toContainText('Bonus stage')
  })
})
