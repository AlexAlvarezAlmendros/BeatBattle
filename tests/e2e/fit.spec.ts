import { expect, type Page, test } from '@playwright/test'
import { open, openGallery } from './support'

/**
 * Que nada se corte (tarea 0.28, jurado visual; `RD-VIS-02`, `RD-VIS-05`, guía §3.3 «Opción de menú»
 * y §2.17, reflow de WCAG 1.4.10):
 *
 * - **Placas del menú**: con cada placa elegida (crece a 31 px), ni la etiqueta ni el dato desbordan su
 *   caja y la tecla `[INTRO]` queda dentro del corte del paralelogramo; también deshabilitadas (el
 *   motivo pasa a dos líneas antes que cortarse) y a 320 px.
 * - **Tildes**: las mayúsculas en display («GRÀCIA», «SALÓN», «PRÓXIMO», «PÚRPURA») no las recorta
 *   ningún antepasado por arriba (las cajas solo recortan en horizontal).
 * - **Galería a 390 px**: ninguna hoja de texto se sale de la ventana (salvo dentro de una fila que se
 *   desplaza, como las pestañas en móvil).
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

test('RD-VIS-05: las tildes en display de la galería (la muestra «ÀÓÚ», placas y alias) salen enteras', async ({
  page,
}) => {
  await openGallery(page)
  await page.evaluate(() => document.fonts.ready)
  await expect(page.locator('[data-accents]').first()).toBeVisible()
  expect(await clippedAccents(page, `${DISPLAY_TEXTS}, section#ficha h2`)).toEqual([])
})

test.describe('galería a 390 × 844', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('RD-VIS-03: ninguna hoja de texto se sale por la derecha de la ventana', async ({ page }) => {
    await openGallery(page)
    await page.evaluate(() => document.fonts.ready)
    const outside = await page.evaluate(() => {
      const width = window.innerWidth
      const out: string[] = []
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const element = node.parentElement
        if (!node.textContent?.trim() || !element || element.closest('.sr-only, [hidden]')) continue
        // Dentro de una fila que se desplaza en horizontal (las pestañas en móvil), salirse es lo normal.
        let scrolls = false
        for (let a: HTMLElement | null = element; a; a = a.parentElement)
          if (/auto|scroll/.test(getComputedStyle(a).overflowX)) scrolls = true
        if (scrolls) continue
        const range = document.createRange()
        range.selectNodeContents(node)
        const rect = range.getBoundingClientRect()
        if (rect.width > 0 && rect.right > width + 1)
          out.push(`«${node.textContent.trim().slice(0, 30)}» llega a ${Math.round(rect.right)} px`)
      }
      return out
    })
    expect(outside).toEqual([])
  })
})

/**
 * Ampliar no quita información (WCAG 1.4.4 y 1.4.10; guía §3.8.3): los pliegues de «móvil» y «móvil bajo»
 * son para los móviles táctiles. En escritorio con zoom (1280 × 720 al 200 % = 640 × 360, teclado y
 * ratón) la pantalla se desplaza en vez de esconder: los chips de la semana, el plazo, el panel de ayuda
 * del modo, la fecha absoluta del reloj y la crónica siguen ahí, visibles y en el árbol de accesibilidad.
 */
test.describe('menú a 640 × 360 (escritorio al 200 %)', () => {
  test.use({ viewport: { width: 640, height: 360 } })

  test('WCAG 1.4.4 / 1.4.10: ampliar no esconde los chips, el plazo, la ayuda, la fecha ni la crónica', async ({
    page,
  }) => {
    await open(page, '/dev/menu', 'Beat Battle')
    const main = page.getByRole('main')
    const card = main.getByRole('article', { name: 'Lluvia en Gràcia' })
    // Los chips de la semana: BPM, tonalidad, duración y género sugerido.
    for (const chip of [/92\s*BPM/i, /Re menor/, /1:12\s*min/i, /Boom bap/]) {
      await expect(card.getByText(chip).first()).toBeVisible()
    }
    // La fecha absoluta del cierre, también en el reloj de la tarjeta.
    await expect(card.getByText('Domingo 11 a las 20:00 · votos hasta las 23:59')).toBeVisible()
    // El reto y las entradas en la batalla.
    await expect(card.getByText(/Usa solo el primer compás/)).toBeVisible()
    // El panel de ayuda del modo elegido (Jugar: el plazo y los créditos), visible y leído.
    const help = main.locator('[aria-live="polite"]').filter({ hasText: 'domingo 11 a las 20:00' })
    await expect(help).toBeVisible()
    await expect(main.getByRole('menu', { name: 'Elige modo' })).toHaveAccessibleDescription(
      /domingo 11 a las 20:00/,
    )
    // La crónica de la barra de controles.
    await expect(page.getByRole('contentinfo').locator('[data-chronicle]')).toBeVisible()
  })
})
