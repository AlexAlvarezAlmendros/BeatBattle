import { expect, test } from '@playwright/test'
import { expectNoAxeViolations, open, openGallery, ROUTES } from './support'

/**
 * Auditoría de accesibilidad con axe (`RNF-A11Y-02`, guía §2.17 y §4.16): reglas de WCAG 2.2 AA, sin
 * ninguna violación, en todas las rutas (las de §2.18, la 404 y el menú de muestra), en la galería con
 * y sin movimiento y en modo serio, y en móvil.
 */

for (const { path, heading } of ROUTES) {
  test(`RNF-A11Y-02: axe sin violaciones WCAG 2.2 AA en ${path}`, async ({ page }) => {
    await open(page, path, heading)
    await expectNoAxeViolations(page)
  })
}

test('RNF-A11Y-02: axe sin violaciones WCAG 2.2 AA en la galería', async ({ page }) => {
  await openGallery(page)
  await expectNoAxeViolations(page)
})

test('RNF-A11Y-02: axe sin violaciones en la galería con «reducir movimiento» y en modo serio', async ({
  page,
}) => {
  await openGallery(page)
  await page.getByRole('switch', { name: /Reducir movimiento/ }).click()
  await page.getByRole('switch', { name: /Modo serio/ }).click()
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced')
  await expect(page.locator('html')).toHaveAttribute('data-serious', '')
  await expectNoAxeViolations(page)
})

test('RNF-A11Y-02: axe sin violaciones con el cursor del menú y el foco en una placa', async ({ page }) => {
  await open(page, '/dev/menu', 'Beat Battle')
  await page.keyboard.press('ArrowDown')
  await expectNoAxeViolations(page)
})

test.describe('móvil (390 × 844)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  for (const { path, heading } of ROUTES.filter((route) =>
    ['/', '/dev/menu', '/como-funciona', '/esto-no-existe', '/ajustes/cuenta'].includes(route.path),
  )) {
    test(`RNF-A11Y-02: axe sin violaciones WCAG 2.2 AA en ${path} en móvil`, async ({ page }) => {
      await open(page, path, heading)
      await expectNoAxeViolations(page)
    })
  }
})
