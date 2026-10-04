import { expect, test } from '@playwright/test'
import { expectNoAxeViolations, open, openGallery } from './support'

/**
 * Auditoría de accesibilidad con axe (`RNF-A11Y-02`, guía §2.17 y §4.16): reglas de WCAG 2.2 AA, sin
 * ninguna violación, en la home, en una página interior y en la galería, en escritorio y en móvil.
 */

const PAGES = [
  { name: 'la home', path: '/', heading: 'Beat Battle' },
  { name: 'una página interior (Cómo funciona)', path: '/como-funciona', heading: 'Cómo funciona' },
  { name: 'la 404', path: '/esto-no-existe', heading: 'Página no encontrada' },
  { name: 'la galería', path: '/dev/galeria', heading: 'Galería de componentes' },
] as const

for (const { name, path, heading } of PAGES) {
  test(`RNF-A11Y-02: axe sin violaciones WCAG 2.2 AA en ${name}`, async ({ page }) => {
    if (path === '/dev/galeria') await openGallery(page)
    else await open(page, path, heading)
    await expectNoAxeViolations(page)
  })
}

test.describe('móvil (390 × 844)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('RNF-A11Y-02: axe sin violaciones WCAG 2.2 AA en la home en móvil', async ({ page }) => {
    await open(page, '/', 'Beat Battle')
    await expectNoAxeViolations(page)
  })

  test('RNF-A11Y-02: axe sin violaciones WCAG 2.2 AA con el menú móvil abierto', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('banner').getByRole('button', { name: 'Menú' }).tap()
    await expect(page.getByRole('dialog', { name: 'Menú' })).toBeVisible()
    await expectNoAxeViolations(page)
  })
})

test('RNF-A11Y-02: axe sin violaciones WCAG 2.2 AA en la galería sin cristal y con «reducir movimiento»', async ({
  page,
}) => {
  await openGallery(page)
  await page.getByRole('switch', { name: /Superficies de cristal/ }).click()
  await page.getByRole('switch', { name: /Reducir movimiento/ }).click()
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced')
  await expectNoAxeViolations(page)
})
