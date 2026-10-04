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

/*
 * La galería es la página más grande de la app (todas las piezas en todos sus estados): cargarla y pasar
 * axe dos veces por la página entera (todas las reglas y después el contraste sin las capas decorativas)
 * pasa del tiempo de 60 s con la máquina cargada. `test.slow()` les da el triple (y la carga, 90 s en vez
 * de 30), sin partir la auditoría: las reglas de página (`duplicate-id`, `landmark-*`, `region`…) siguen
 * viendo la galería entera.
 */
test('RNF-A11Y-02: axe sin violaciones WCAG 2.2 AA en la galería', async ({ page }) => {
  test.slow()
  await openGallery(page, 90_000)
  await expectNoAxeViolations(page)
})

test('RNF-A11Y-02: axe sin violaciones en la galería con «reducir movimiento» y en modo serio', async ({
  page,
}) => {
  test.slow()
  await openGallery(page, 90_000)
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
