import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { collectErrors, open, openGallery, WCAG_22_AA } from './support'

/**
 * Zona de avisos del marco (§3.3, `RNF-A11Y-07`): una sola, montada en `RootLayout`, con las dos
 * regiones vivas desde la primera pintura y la parte animada en diferido.
 */

test('RNF-A11Y-07: la home trae la zona de avisos del marco, con sus dos regiones vivas vacías', async ({
  page,
}) => {
  await open(page, '/', 'Beat Battle')
  const zone = page.getByRole('region', { name: 'Avisos' })
  await expect(zone).toHaveCount(1)
  await expect(zone.locator('[aria-live="polite"]')).toBeEmpty()
  await expect(zone.locator('[aria-live="assertive"]')).toBeEmpty()
})

test('RNF-A11Y-07: los avisos de la galería salen en la zona del marco, cada uno en su región, y se cierran con el teclado', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await openGallery(page)
  const zone = page.getByRole('region', { name: 'Avisos' })
  await expect(zone).toHaveCount(1)
  const demo = page.locator('section#aviso')
  await demo.getByRole('button', { name: 'Lanzar éxito' }).click()
  await demo.getByRole('button', { name: 'Lanzar error' }).click()
  const polite = zone.locator('[aria-live="polite"]')
  const assertive = zone.locator('[aria-live="assertive"]')
  await expect(polite.getByRole('listitem')).toHaveText(/Beat subido/)
  await expect(assertive.getByRole('listitem')).toHaveText(/Se ha cortado la subida/)
  // El tono, con palabras (nunca solo el color).
  await expect(assertive.getByRole('img', { name: 'Error' })).toBeVisible()

  // Con el foco dentro, el aviso no se cierra solo (WCAG 2.2.1): da tiempo a pasar axe por la zona.
  const close = assertive.getByRole('button', { name: 'Cerrar aviso' })
  await close.focus()
  await expect(assertive.locator('[data-paused]')).toHaveCount(1)
  const { violations } = await new AxeBuilder({ page })
    .include('section[aria-label="Avisos"]')
    .withTags([...WCAG_22_AA])
    .analyze()
  expect(violations.map((violation) => violation.id)).toEqual([])

  await page.keyboard.press('Enter')
  await expect(assertive.getByRole('listitem')).toHaveCount(0)
  expect(errors).toEqual([])
})
