import { expect, type Page, test } from '@playwright/test'
import { openGallery, ROUTES } from './support'

/**
 * Texto legible (`RD-VIS-05`, guía §3.2 «Escala»; tarea 0.27): ningún texto con información por debajo
 * de 12 px, en cada ruta, en escritorio y en móvil. Se mira cada elemento con texto propio que se pinta
 * (también lo decorativo, como las teclas; los gráficos SVG —el logo, las medallas— van aparte, como
 * imagen con su nombre, y el texto solo para lectores de pantalla no se pinta). La parte de «nunca sobre trama» la cubren las formas de la
 * trama (`halftone.test.ts`) y el jurado visual (0.28).
 */

/** Textos visibles por debajo de `min` px, con su tamaño y un trozo del texto. */
function smallTexts(page: Page, min = 12): Promise<string[]> {
  return page.evaluate((minimum) => {
    const small: string[] = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim()
      const element = node.parentElement
      if (!text || !element) continue
      // Gráficos (SVG: el logo, las medallas) y lo que no se pinta (solo para lectores de pantalla).
      if (element.closest('svg, .sr-only, [hidden]')) continue
      const style = getComputedStyle(element)
      if (style.visibility === 'hidden' || style.display === 'none') continue
      const box = element.getBoundingClientRect()
      if (box.width < 2 || box.height < 2) continue
      const size = Number.parseFloat(style.fontSize)
      if (size < minimum) small.push(`${size}px «${text.slice(0, 40)}» (${element.tagName.toLowerCase()})`)
    }
    return small
  }, min)
}

for (const { path, heading } of ROUTES) {
  test(`RD-VIS-05: ningún texto de menos de 12 px en ${path}`, async ({ page }) => {
    await page.goto(path)
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(heading)
    expect(await smallTexts(page)).toEqual([])
  })
}

test('RD-VIS-05: ningún texto de menos de 12 px en la galería', async ({ page }) => {
  await openGallery(page)
  expect(await smallTexts(page)).toEqual([])
})

test.describe('móvil (390 × 844)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  for (const path of ['/', '/dev/menu', '/como-funciona', '/esto-no-existe', '/ajustes/cuenta']) {
    test(`RD-VIS-05: ningún texto de menos de 12 px en ${path} en móvil`, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeAttached()
      expect(await smallTexts(page)).toEqual([])
    })
  }
})
