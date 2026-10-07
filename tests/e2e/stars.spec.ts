import { expect, test } from '@playwright/test'
import { openGallery } from './support'

/**
 * Estrellas (guía §3.8.4, tarea 1.5) en la celda interactiva de la galería: duermen hasta cumplir la
 * escucha mínima, despiertan y se votan con el teclado, y el servidor (simulado, medio segundo) confirma.
 */
test('RNF-A11Y-06 / RF-VOTE-10: duermen hasta los 30 s, despiertan y se votan con el teclado; el cursor queda en la votada', async ({
  page,
}) => {
  await openGallery(page)
  const cell = page.locator('section#estrellas figure').filter({ hasText: 'Interactivo' })
  await cell.scrollIntoViewIfNeeded()
  const group = cell.getByRole('radiogroup')
  await expect(group).toHaveAttribute('aria-disabled', 'true')
  await expect(cell.getByRole('meter')).toHaveAttribute('aria-valuenow', '0')
  // Dormidas, ni la tecla ni el clic votan.
  await cell.getByRole('radio', { name: '3 de 5 estrellas: Bien' }).click({ force: true })
  await expect(cell.getByRole('radio', { checked: true })).toHaveCount(0)
  for (let i = 0; i < 3; i++) await cell.getByRole('button', { name: /Escuchar 10/ }).click()
  await expect(group).not.toHaveAttribute('aria-disabled')
  await expect(cell.getByRole('meter')).toHaveCount(0)
  await cell.getByRole('radio', { name: '1 de 5 estrellas: Flojo' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(cell.getByRole('radio', { name: '2 de 5 estrellas: Regular' })).toBeFocused()
  await page.keyboard.press('4')
  const four = cell.getByRole('radio', { name: '4 de 5 estrellas: Muy bien' })
  await expect(four).toBeFocused()
  await expect(four).toHaveAttribute('aria-checked', 'true')
  // «Guardando» dura lo que tarda el servidor simulado (500 ms): lo prueba el test del componente con el
  // reloj simulado; aquí, que acaba confirmado.
  await expect(cell.locator('[data-status="saved"]')).toContainText('4 de 5 · Muy bien. Voto guardado.')
  await expect(group).not.toHaveAttribute('aria-busy')
})
