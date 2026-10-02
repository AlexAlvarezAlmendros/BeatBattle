import { expect, type Page, test } from '@playwright/test'
import { collectErrors } from './support'

/**
 * Navegación por la isla del sello (tarea 0.7, guía §2.18 y §3.1): en escritorio con sus enlaces y en
 * móvil (390 × 844, el móvil de §4.16) con el panel del menú; y la 404 dentro del marco (tarea 0.10).
 */

/** Enlaces de la isla, en orden, con la ruta y el `<h1>` de su página. */
const NAV = [
  { name: 'Jurado', path: '/jurado', heading: 'Modo Jurado' },
  { name: 'Resultados', path: '/semanas', heading: 'Semanas' },
  { name: 'Salón de la fama', path: '/salon-de-la-fama', heading: 'Salón de la fama' },
  { name: 'Cómo funciona', path: '/como-funciona', heading: 'Cómo funciona' },
  { name: 'Semana', path: '/', heading: 'Beat Battle' },
] as const

const mainHeading = (page: Page) => page.getByRole('main').getByRole('heading', { level: 1 })

test.describe('escritorio (1440 × 900)', () => {
  test('la isla lleva a cada página: URL, <h1>, título, aria-current y foco en el contenido', async ({
    page,
  }) => {
    const errors = collectErrors(page)
    await page.goto('/')
    const nav = page.getByRole('banner').getByRole('navigation', { name: 'Principal' })

    for (const item of NAV) {
      const link = nav.getByRole('link', { name: item.name, exact: true })
      await link.click()
      await expect(page).toHaveURL(item.path)
      await expect(mainHeading(page)).toHaveText(item.heading)
      await expect(link).toHaveAttribute('aria-current', 'page')
      await expect(nav.locator('[aria-current="page"]')).toHaveCount(1)
      await expect(page).toHaveTitle(
        item.path === '/' ? 'Beat Battle · Other People' : `${item.heading} · Beat Battle`,
      )
      // Al cambiar de página el foco pasa al <main> (§2.17): el lector empieza por el contenido nuevo.
      await expect(page.getByRole('main')).toBeFocused()
    }

    // «Entrar», a la derecha de la isla.
    await page.getByRole('banner').getByRole('link', { name: 'Entrar', exact: true }).click()
    await expect(page).toHaveURL('/entrar')
    await expect(mainHeading(page)).toHaveText('Entrar')
    expect(errors).toEqual([])
  })

  test('Atrás y Adelante del navegador recorren el historial de la isla', async ({ page }) => {
    await page.goto('/')
    const nav = page.getByRole('banner').getByRole('navigation', { name: 'Principal' })
    await nav.getByRole('link', { name: 'Jurado', exact: true }).click()
    await expect(mainHeading(page)).toHaveText('Modo Jurado')
    await page.goBack()
    await expect(page).toHaveURL('/')
    await expect(mainHeading(page)).toHaveText('Beat Battle')
    await page.goForward()
    await expect(page).toHaveURL('/jurado')
    await expect(mainHeading(page)).toHaveText('Modo Jurado')
  })
})

test.describe('móvil (390 × 844)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('el menú móvil abre un diálogo con los enlaces, navega y se cierra', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto('/')
    const island = page.getByRole('banner')
    // En móvil los enlaces no están en la isla: solo el logo y el botón del menú.
    await expect(island.getByRole('navigation', { name: 'Principal' })).toBeHidden()
    const toggle = island.getByRole('button', { name: 'Menú' })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await toggle.tap()
    const dialog = page.getByRole('dialog', { name: 'Menú' })
    await expect(dialog).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    // El foco entra al diálogo (botón de cerrar) y lo de detrás queda inerte.
    await expect(dialog.getByRole('button', { name: 'Cerrar el menú' })).toBeFocused()
    await expect(page.getByRole('main')).toHaveAttribute('inert', '')

    const nav = dialog.getByRole('navigation', { name: 'Principal' })
    await expect(nav.getByRole('link')).toHaveCount(NAV.length)
    await nav.getByRole('link', { name: 'Cómo funciona' }).tap()

    await expect(dialog).toBeHidden()
    await expect(page).toHaveURL('/como-funciona')
    await expect(mainHeading(page)).toHaveText('Cómo funciona')
    await expect(page.getByRole('main')).not.toHaveAttribute('inert', '')
    await expect(page.getByRole('main')).toBeFocused()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(errors).toEqual([])
  })

  test('el menú móvil se cierra con Esc y con el botón, y el foco vuelve al botón «Menú»', async ({
    page,
  }) => {
    await page.goto('/')
    const toggle = page.getByRole('banner').getByRole('button', { name: 'Menú' })
    const dialog = page.getByRole('dialog', { name: 'Menú' })

    await toggle.tap()
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(toggle).toBeFocused()

    await toggle.tap()
    await dialog.getByRole('button', { name: 'Cerrar el menú' }).tap()
    await expect(dialog).toBeHidden()
    await expect(toggle).toBeFocused()
    await expect(page.getByRole('main')).not.toHaveAttribute('inert', '')
  })

  test('el menú móvil lleva a «Entrar» y a las redes del sello', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('banner').getByRole('button', { name: 'Menú' }).tap()
    const dialog = page.getByRole('dialog', { name: 'Menú' })
    const social = dialog.getByRole('list', { name: 'Redes de Other People Records' })
    await expect(social.getByRole('link')).toHaveCount(3)
    await dialog.getByRole('link', { name: 'Entrar', exact: true }).tap()
    await expect(dialog).toBeHidden()
    await expect(page).toHaveURL('/entrar')
  })
})

test.describe('404', () => {
  test('una ruta que no existe pinta la 404 dentro del marco, con vuelta al inicio', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto('/esto-no-existe')
    await expect(mainHeading(page)).toHaveText('Página no encontrada')
    await expect(page).toHaveTitle('Página no encontrada · Beat Battle')
    await expect(page.getByRole('banner')).toBeVisible()
    await expect(page.getByRole('contentinfo')).toBeVisible()

    await page.getByRole('main').getByRole('link', { name: 'Volver al inicio' }).click()
    await expect(page).toHaveURL('/')
    await expect(mainHeading(page)).toHaveText('Beat Battle')
    expect(errors).toEqual([])
  })

  test('un documento legal que no existe también es 404 (loader de /legal/:doc)', async ({ page }) => {
    await page.goto('/legal/no-existe')
    await expect(mainHeading(page)).toHaveText('Página no encontrada')
    await expect(page.getByRole('banner')).toBeVisible()
  })
})
