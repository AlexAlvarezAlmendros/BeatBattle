import { expect, test } from '@playwright/test'
import { collectErrors } from './support'

/**
 * Integridad de las portadas generativas (guía §3.4.5, `RD-VIS-04`; tarea 4.11). En `/dev/portadas` cada
 * portada se pinta por CPU (contexto 2D con `willReadFrequently`) y se mide; aquí se comprueba, con el
 * Chrome del sistema y la GPU real (las opciones de `tools/shot`, `playwright.config.ts`), que con 48
 * semillas la proporción de rojo y la luminancia media de cada una quedan a ±5 % de la media, y que salen
 * las 8 familias.
 */
test('RD-VIS-04: con 48 semillas, rojo y luminancia de cada portada a ±5 % de la media (8 familias)', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await page.goto('/dev/portadas?n=48')
  const items = page.locator('[data-cover-index]')
  await expect(items).toHaveCount(48)
  // Cada portada anota su medida al terminar de pintar.
  await expect(page.locator('[data-cover-index][data-red]')).toHaveCount(48, { timeout: 30_000 })
  const measured = await items.evaluateAll((nodes) =>
    nodes.map((node) => ({
      red: Number((node as HTMLElement).dataset.red),
      lum: Number((node as HTMLElement).dataset.lum),
      family: (node as HTMLElement).dataset.family ?? '',
      passes: Number((node as HTMLElement).dataset.passes),
    })),
  )
  const mean = (key: 'red' | 'lum') => measured.reduce((sum, item) => sum + item[key], 0) / measured.length
  const red = mean('red')
  const lum = mean('lum')
  expect(red).toBeGreaterThan(0)
  for (const [index, item] of measured.entries()) {
    expect(Math.abs(item.red - red) / red, `rojo de la portada ${index}`).toBeLessThanOrEqual(0.05)
    expect(Math.abs(item.lum - lum) / lum, `luminancia de la portada ${index}`).toBeLessThanOrEqual(0.05)
    // §3.4.5: de dos a cinco pasadas de medida.
    expect(item.passes).toBeGreaterThanOrEqual(2)
    expect(item.passes).toBeLessThanOrEqual(5)
  }
  expect(new Set(measured.map((item) => item.family)).size).toBe(8)
  await expect(page.locator('[data-covers-summary]')).toHaveAttribute('data-pass', 'true')
  expect(errors).toEqual([])
})
