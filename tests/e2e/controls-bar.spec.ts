import { expect, type Page, test } from '@playwright/test'
import { open, settle } from './support'

/**
 * La barra de controles con teclado y ratón (guía §3.4.1 y §3.8.3; WCAG 1.4.4 y 1.4.10; tercer pase del
 * jurado de la 0.28): **no se esconde nada que informe**. Los pliegues que esconden son del móvil táctil.
 */

/**
 * Teclas de la barra que no se ven enteras: fuera de la ventana o recortadas por un antepasado que
 * recorta (`overflow`, `clip-path`, `contain: paint`). Devuelve también cuántas hay en la lista.
 */
function hiddenKeys(page: Page): Promise<{ count: number; hidden: string[] }> {
  return page.evaluate(() => {
    const list = document.querySelector('footer ul')
    const keys = [...(list?.children ?? [])] as HTMLElement[]
    const hidden: string[] = []
    for (const key of keys) {
      const box = key.getBoundingClientRect()
      const name = key.textContent?.trim() ?? '?'
      if (!key.checkVisibility({ visibilityProperty: true }) || box.width < 1 || box.height < 1) {
        hidden.push(`${name}: no se ve`)
        continue
      }
      if (box.left < -0.5 || box.top < -0.5 || box.right > innerWidth + 0.5 || box.bottom > innerHeight + 0.5)
        hidden.push(`${name}: fuera de la ventana`)
      for (let node = key.parentElement; node && node !== document.body; node = node.parentElement) {
        const style = getComputedStyle(node)
        const clips =
          style.overflowX !== 'visible' ||
          style.overflowY !== 'visible' ||
          style.clipPath !== 'none' ||
          /paint|strict|content/.test(style.contain)
        if (!clips) continue
        const rect = node.getBoundingClientRect()
        if (
          box.left < rect.left - 0.5 ||
          box.top < rect.top - 0.5 ||
          box.right > rect.right + 0.5 ||
          box.bottom > rect.bottom + 0.5
        )
          hidden.push(`${name}: recortada por ${node.tagName}`)
      }
    }
    return { count: keys.length, hidden }
  })
}

/**
 * L7: de 721 a unos 1400 px con teclado, las teclas que no cabían en su columna pasaban a una fila
 * oculta (a 823 × 514, 1440 al 175 %, solo se veía «↑↓ ELEGIR»; a 1280, faltaba «M SONIDO»). Ahora, si
 * no caben al lado de la firma, van en su propia fila encima y parten si hace falta.
 */
for (const { width, height } of [
  { width: 721, height: 900 },
  { width: 823, height: 514 },
  { width: 900, height: 700 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
]) {
  test.describe(`barra con teclado a ${width} × ${height}`, () => {
    test.use({ viewport: { width, height } })

    for (const { path, heading, keys } of [
      { path: '/dev/menu', heading: 'Beat Battle', keys: 4 },
      { path: '/como-funciona', heading: 'Cómo se juega', keys: 4 },
      { path: '/ajustes', heading: 'Sonido y efectos', keys: 3 },
    ]) {
      test(`RD-VIS-02 e / WCAG 1.4.10: en ${path} se ven enteras todas las teclas de la barra`, async ({
        page,
      }) => {
        await open(page, path, heading)
        await settle(page)
        const { count, hidden } = await hiddenKeys(page)
        expect(count).toBe(keys)
        expect(hidden).toEqual([])
      })
    }
  })
}
