import { expect, type Page, test } from '@playwright/test'
import { open } from './support'

/**
 * Que nada se corte (tarea 0.28, jurado visual; `RD-VIS-02`, `RD-VIS-05`, guía §3.3 «Opción de menú»
 * y §2.17, reflow de WCAG 1.4.10):
 *
 * - **Placas del menú**: con cada placa elegida (crece a 31 px), ni la etiqueta ni el dato desbordan su
 *   caja y la tecla `[INTRO]` queda dentro del corte del paralelogramo; también deshabilitadas (el
 *   motivo pasa a dos líneas antes que cortarse) y a 320 px.
 * - **Tildes**: las mayúsculas en display («GRÀCIA», «SALÓN», «PRÓXIMO», «PÚRPURA») no las recorta
 *   ningún antepasado por arriba (las cajas solo recortan en horizontal).
 */

interface PlateCut {
  plate: string
  problem: string
}

/** Elige cada placa del menú (foco) y mide si su etiqueta, su dato o su tecla se cortan. */
function plateCuts(page: Page): Promise<PlateCut[]> {
  return page.evaluate(async () => {
    const frame = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
    const cuts: { plate: string; problem: string }[] = []
    const plates = [...document.querySelectorAll<HTMLElement>('main [data-menu-plate]')]
    for (const plate of plates) {
      plate.focus()
      await frame()
      // El ajuste de la etiqueta va en el fotograma siguiente al cambio de ancho (transición de 120 ms).
      await new Promise((done) => setTimeout(done, 250))
      await frame()
      const name = plate.querySelector('[data-plate-label]')?.textContent ?? '?'
      const label = plate.querySelector<HTMLElement>('[data-plate-label]')!
      if (label.scrollWidth > label.clientWidth + 1)
        cuts.push({ plate: name, problem: `etiqueta ${label.scrollWidth} > ${label.clientWidth}` })
      const detail = plate.querySelector<HTMLElement>('[data-plate-detail]')
      if (detail && detail.scrollWidth > detail.clientWidth + 1)
        cuts.push({ plate: name, problem: `dato ${detail.scrollWidth} > ${detail.clientWidth}` })
      // El relleno del final es, como poco, el desplazamiento del paralelogramo más un margen: lo que
      // acaba antes de él queda dentro del corte.
      const box = plate.getBoundingClientRect()
      const end = box.right - Number.parseFloat(getComputedStyle(plate).paddingRight)
      for (const piece of plate.querySelectorAll<HTMLElement>('kbd, [data-plate-detail]')) {
        if (getComputedStyle(piece).display === 'none') continue
        const rect = piece.getBoundingClientRect()
        if (rect.right > end + 1 || rect.left < box.left)
          cuts.push({ plate: name, problem: `${piece.tagName.toLowerCase()} fuera del corte` })
      }
    }
    return cuts
  })
}

/** Textos en display con tilde que algún antepasado recorta por arriba. */
function clippedAccents(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((targets) => {
    const clipped: string[] = []
    for (const element of document.querySelectorAll<HTMLElement>(targets)) {
      const text = element.textContent ?? ''
      if (!/[ÀÁÈÉÍÒÓÚÜàáèéíòóúü]/.test(text)) continue
      const range = document.createRange()
      range.selectNodeContents(element)
      const top = range.getBoundingClientRect().top
      for (
        let node: HTMLElement | null = element;
        node && node !== document.body;
        node = node.parentElement
      ) {
        const style = getComputedStyle(node)
        const clips =
          style.overflowY !== 'visible' ||
          style.clipPath !== 'none' ||
          /paint|strict|content/.test(style.contain)
        if (clips && top < node.getBoundingClientRect().top - 0.5) {
          clipped.push(
            `«${text.trim()}» recortado por ${node.tagName.toLowerCase()}.${String(node.className)}`,
          )
          break
        }
      }
    }
    return clipped
  }, selector)
}

const DISPLAY_TEXTS = '[data-plate-label], article h2, [data-accents], [data-accents] [data-plate-label]'

for (const viewport of [
  { width: 1440, height: 900, touch: false },
  { width: 390, height: 844, touch: true },
  { width: 320, height: 568, touch: true },
]) {
  test.describe(`${viewport.width} × ${viewport.height}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.touch,
      hasTouch: viewport.touch,
    })

    for (const path of ['/dev/menu', '/']) {
      test(`§3.3 / RD-VIS-02: ninguna placa elegida de ${path} corta su etiqueta, su dato ni su tecla`, async ({
        page,
      }) => {
        await open(page, path, 'Beat Battle')
        await page.evaluate(() => document.fonts.ready)
        expect(await plateCuts(page)).toEqual([])
      })

      test(`RD-VIS-05: las tildes de las mayúsculas en display de ${path} salen enteras`, async ({
        page,
      }) => {
        await open(page, path, 'Beat Battle')
        await page.evaluate(() => document.fonts.ready)
        expect(await clippedAccents(page, DISPLAY_TEXTS)).toEqual([])
      })
    }
  })
}
