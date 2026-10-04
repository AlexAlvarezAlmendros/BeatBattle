import { expect, type Page, test } from '@playwright/test'
import { settle } from './support'

/**
 * Ningún texto del HUD va directamente sobre los rayos (`RD-VIS-05`, guía §3.2 «Texturas»: ningún texto
 * sobre trama, rayos o líneas de barrido; tercer pase del jurado de la 0.28, L12). En el menú, «LILBRU»,
 * «NV 7 · BEATMAKER» y «XP 2.980 / NV 8 · 3.350» iban sobre las bandas del estallido.
 *
 * Se mide en píxeles: con los textos del HUD transparentes (sus paneles, que sí pueden ir sobre los
 * rayos, se quedan), una captura con los rayos y otra sin ellos; dentro de las cajas de cada texto del
 * HUD las dos tienen que ser iguales.
 */

test.use({ reducedMotion: 'reduce' })

/** Selector de los rayos de la arena: la capa de espectáculo (`data-fx`) de la arena de detrás. */
const RAYS = '[data-wedge][aria-hidden] > [data-fx]'

interface Rect {
  x: number
  y: number
  width: number
  height: number
  text: string
}

/** Cajas de los textos visibles del HUD (cada línea de cada nodo de texto). */
function hudTextRects(page: Page): Promise<Rect[]> {
  return page.evaluate(() => {
    const rects: { x: number; y: number; width: number; height: number; text: string }[] = []
    const header = document.querySelector('.game-frame > header')
    if (!header) return rects
    const walker = document.createTreeWalker(header, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim() ?? ''
      const parent = node.parentElement
      if (!text || !parent || parent.closest('.sr-only')) continue
      if (!parent.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      for (const box of range.getClientRects()) {
        if (box.width < 1 || box.height < 1) continue
        rects.push({ x: box.x, y: box.y, width: box.width, height: box.height, text })
      }
    }
    return rects
  })
}

/** Píxeles de cada caja que cambian entre las dos capturas (más de 2/255 en algún canal). */
function changedPixels(page: Page, withRays: Buffer, withoutRays: Buffer, rects: Rect[]) {
  return page.evaluate(
    async ({ a, b, rects }) => {
      const decode = async (data: string) => {
        const image = new Image()
        image.src = `data:image/png;base64,${data}`
        await image.decode()
        const canvas = new OffscreenCanvas(image.width, image.height)
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!
        ctx.drawImage(image, 0, 0)
        return ctx.getImageData(0, 0, image.width, image.height)
      }
      const [one, two] = await Promise.all([decode(a), decode(b)])
      const out: string[] = []
      for (const rect of rects) {
        let changed = 0
        const left = Math.max(0, Math.floor(rect.x))
        const top = Math.max(0, Math.floor(rect.y))
        const right = Math.min(one.width, Math.ceil(rect.x + rect.width))
        const bottom = Math.min(one.height, Math.ceil(rect.y + rect.height))
        for (let y = top; y < bottom; y++)
          for (let x = left; x < right; x++) {
            const i = (y * one.width + x) * 4
            if (
              Math.abs(one.data[i]! - two.data[i]!) > 2 ||
              Math.abs(one.data[i + 1]! - two.data[i + 1]!) > 2 ||
              Math.abs(one.data[i + 2]! - two.data[i + 2]!) > 2
            )
              changed++
          }
        if (changed > 0) out.push(`«${rect.text}»: ${changed} px de rayos`)
      }
      return out
    },
    { a: withRays.toString('base64'), b: withoutRays.toString('base64'), rects },
  )
}

for (const { width, height, touch, path, heading } of [
  { width: 1440, height: 900, touch: false, path: '/dev/menu', heading: 'Beat Battle' },
  { width: 1440, height: 900, touch: false, path: '/', heading: 'Beat Battle' },
  { width: 1440, height: 900, touch: false, path: '/entrar', heading: 'Entrar' },
  { width: 1440, height: 900, touch: false, path: '/como-funciona', heading: 'Cómo se juega' },
  { width: 1024, height: 768, touch: false, path: '/dev/menu', heading: 'Beat Battle' },
  { width: 390, height: 844, touch: true, path: '/dev/menu', heading: 'Beat Battle' },
  { width: 390, height: 844, touch: true, path: '/', heading: 'Beat Battle' },
  { width: 390, height: 844, touch: true, path: '/como-funciona', heading: 'Cómo se juega' },
]) {
  test.describe(`${width} × ${height}${touch ? ' táctil' : ''}`, () => {
    test.use({ viewport: { width, height }, isMobile: touch, hasTouch: touch })

    test(`RD-VIS-05: en ${path}, ningún texto del HUD va sobre los rayos`, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(heading)
      await settle(page)
      const rects = await hudTextRects(page)
      expect(rects.length, 'textos en el HUD').toBeGreaterThan(0)
      await expect(page.locator(RAYS)).toHaveCount(1)
      await page.addStyleTag({
        content:
          '.game-frame > header, .game-frame > header * { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; }',
      })
      const withRays = await page.screenshot()
      await page.addStyleTag({ content: `${RAYS} { display: none !important; }` })
      const withoutRays = await page.screenshot()
      expect(await changedPixels(page, withRays, withoutRays, rects)).toEqual([])
    })
  })
}
