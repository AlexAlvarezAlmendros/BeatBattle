import { expect, type Page, test } from '@playwright/test'
import { open, settle } from './support'

/**
 * Composición de las pantallas interiores (guía §3.8.14, §3.8.11; `RD-VIS-02` e: segundo pase del
 * jurado visual de la tarea 0.28). La plantilla (`ScreenPage`) reparte la pantalla como las maquetas
 * (`02-seleccion`, `05-perfil`): nada de medio panel arriba y la otra mitad vacía.
 *
 * - **Pantallas con pieza** («Cómo se juega», la 404): el panel de la derecha llega al pie de la pieza
 *   de la cuña.
 */

test.use({ reducedMotion: 'reduce' })

interface Box {
  top: number
  bottom: number
  left: number
  right: number
}

/** Cajas de unos cuantos elementos (la primera coincidencia de cada selector) y de la barra y el HUD. */
async function boxes<K extends string>(
  page: Page,
  selectors: Record<K, string>,
): Promise<Record<K | 'hud' | 'bar', Box>> {
  const all = { ...selectors, hud: '.game-frame > header', bar: '.game-frame > footer' }
  const found = await page.evaluate((entries) => {
    const result: Record<string, Box | null> = {}
    for (const [name, selector] of entries) {
      const element = document.querySelector(selector)
      const rect = element?.getBoundingClientRect()
      result[name] = rect ? { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right } : null
    }
    return result
  }, Object.entries(all))
  for (const [name, box] of Object.entries(found)) expect(box, `no está «${name}»`).not.toBeNull()
  return found as Record<K | 'hud' | 'bar', Box>
}

const PANEL = 'main [data-screen-part="panel"]'
const PIECE = 'main [data-screen-part="piece"]'

test.describe('1440 × 900', () => {
  test('RD-VIS-02 e: «Cómo se juega» estira el panel de reglas hasta el pie de la lista de movimientos', async ({
    page,
  }) => {
    await open(page, '/como-funciona', 'Cómo se juega')
    await settle(page)
    const box = await boxes(page, {
      panel: PANEL,
      back: `${PIECE} ul > li:last-child > a`,
      lastRule: 'main ol > li:last-child',
    })
    // El pie del panel, a la altura de «Volver al menú».
    expect(Math.abs(box.panel.bottom - box.back.bottom)).toBeLessThanOrEqual(2)
    // Las cinco filas se reparten el alto del panel: la última llega a su pie.
    expect(box.panel.bottom - box.lastRule.bottom).toBeLessThanOrEqual(48)
  })

  test('RD-VIS-02 e: la 404 estira el panel del subtítulo hasta el pie del pad', async ({ page }) => {
    await open(page, '/esto-no-existe', 'Bonus stage')
    await settle(page)
    const box = await boxes(page, { panel: PANEL, piece: PIECE })
    expect(Math.abs(box.panel.bottom - box.piece.bottom)).toBeLessThanOrEqual(2)
  })
})
