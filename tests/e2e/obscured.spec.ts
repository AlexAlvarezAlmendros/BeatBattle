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

/**
 * Lo que se sale de la ventana del foco de cada control de la barra de controles (jurado de la 0.28,
 * L6): el contorno (3 px a 4 px de la caja) y el halo (`--bb-focus-halo`, 10 px), con lo que de ellos
 * deje ver un `clip-path` del propio control. Se enfoca cada uno con el teclado ya en uso (Tab antes),
 * para que sea `:focus-visible`.
 */
async function barRingsOutsideWindow(page: Page): Promise<string[]> {
  await page.keyboard.press('Tab')
  const controls = page.getByRole('contentinfo').locator('a[href], button')
  const outside: string[] = []
  for (const control of await controls.all()) {
    if (!(await control.isVisible())) continue
    await control.focus()
    const result = await control.evaluate((element) => {
      const style = getComputedStyle(element)
      const px = (value: string) => Number.parseFloat(value) || 0
      const outline = style.outlineStyle === 'none' ? 0 : px(style.outlineOffset) + px(style.outlineWidth)
      // Extensión de la sombra (el último valor en px de `box-shadow`) y lo que deja ver un `inset()`.
      const spread =
        style.boxShadow === 'none' ? 0 : px(style.boxShadow.match(/(-?[\d.]+)px\s*$/)?.[1] ?? '0')
      const clip = style.clipPath.startsWith('inset(')
        ? -px(style.clipPath.slice(6))
        : Number.POSITIVE_INFINITY
      const extent = Math.max(outline, Math.min(spread, clip))
      const box = element.getBoundingClientRect()
      const ring = {
        left: box.left - extent,
        top: box.top - extent,
        right: box.right + extent,
        bottom: box.bottom + extent,
      }
      const inside =
        ring.left >= -0.5 &&
        ring.top >= -0.5 &&
        ring.right <= window.innerWidth + 0.5 &&
        ring.bottom <= window.innerHeight + 0.5
      return {
        focusVisible: element.matches(':focus-visible'),
        inside,
        label: (element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 32),
        ring: `${ring.left.toFixed(1)},${ring.top.toFixed(1)} → ${ring.right.toFixed(1)},${ring.bottom.toFixed(1)}`,
      }
    })
    if (!result.focusVisible) outside.push(`${result.label}: sin :focus-visible`)
    else if (!result.inside) outside.push(`${result.label}: ${result.ring}`)
  }
  return outside
}

for (const { width, height, touch, paths } of [
  { width: 1440, height: 900, touch: false, paths: ['/dev/menu', '/como-funciona'] },
  { width: 1024, height: 768, touch: false, paths: ['/dev/menu', '/como-funciona'] },
  { width: 390, height: 844, touch: false, paths: ['/dev/menu', '/como-funciona'] },
  { width: 390, height: 844, touch: true, paths: ['/como-funciona'] },
]) {
  test.describe(`barra de controles a ${width} × ${height}${touch ? ' táctil' : ''}`, () => {
    test.use({ viewport: { width, height }, isMobile: touch, hasTouch: touch })

    for (const path of paths) {
      test(`RNF-A11Y-01 / WCAG 2.4.11: en ${path}, el anillo y el halo del foco de cada pieza de la barra caben en la ventana`, async ({
        page,
      }) => {
        await open(page, path, path === '/como-funciona' ? 'Cómo se juega' : 'Beat Battle')
        expect(await barRingsOutsideWindow(page)).toEqual([])
      })
    }
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
