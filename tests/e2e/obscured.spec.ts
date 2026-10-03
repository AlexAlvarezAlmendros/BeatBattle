import { expect, type Page, test } from '@playwright/test'
import { open } from './support'

/**
 * Ningún control enfocado queda tapado por la barra de controles (guía §3.3 y §3.4.1; WCAG 2.4.11 y
 * 1.4.10). La barra va pegada al pie de la ventana y en ventanas estrechas con teclado crece (las teclas
 * en una fila encima de la firma): el margen del foco no puede ser un número fijo. Se recorre el menú
 * con ↓ en ventanas pequeñas de escritorio (zoom del 200 % y del 400 %) y en un móvil con teclado, y
 * cada placa enfocada tiene que quedar entera por encima de la barra.
 */

/** Cuánto del elemento enfocado tapa la barra de controles (px) y si está entero dentro de la ventana. */
function focusedVersusBar(page: Page) {
  return page.evaluate(() => {
    const focused = document.activeElement as HTMLElement | null
    const bar = document.querySelector('footer')
    if (!focused || !bar) return { label: 'nada', covered: -1, inside: false }
    const box = focused.getBoundingClientRect()
    const barBox = bar.getBoundingClientRect()
    const sticky = getComputedStyle(bar).position === 'sticky' || getComputedStyle(bar).position === 'fixed'
    // Si la barra flota sobre el contenido, lo que quede por debajo de su borde superior está tapado.
    const covered = sticky ? Math.max(0, box.bottom - barBox.top) : 0
    const inside = box.top >= 0 && box.bottom <= window.innerHeight
    return { label: focused.textContent?.slice(0, 24) ?? '', covered, inside }
  })
}

for (const viewport of [
  { width: 320, height: 256, name: '1280 px al 400 %' },
  { width: 640, height: 360, name: '1280 × 720 al 200 %' },
  { width: 390, height: 844, name: 'móvil con teclado' },
]) {
  test(`§3.3 / WCAG 2.4.11: a ${viewport.width}×${viewport.height} (${viewport.name}) ninguna placa enfocada queda bajo la barra`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await open(page, '/dev/menu', 'Beat Battle')
    const problems: string[] = []
    for (let step = 0; step < 6; step++) {
      await page.keyboard.press('ArrowDown')
      // El desplazamiento al foco es instantáneo; se deja un fotograma para medir.
      await page.evaluate(
        () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
      )
      const { label, covered, inside } = await focusedVersusBar(page)
      if (covered > 0.5 || !inside)
        problems.push(`${label}: tapado ${covered.toFixed(1)} px, entero=${inside}`)
    }
    expect(problems).toEqual([])
  })
}
