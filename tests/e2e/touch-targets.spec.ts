import { expect, type Page, test } from '@playwright/test'
import { open } from './support'

/**
 * Objetivos táctiles de 44 × 44 px en móvil (`RNF-A11Y-09`, guía §2.17; auditoría a 360 px). Se mide el
 * área **efectiva** de cada control visible: desde su centro, hasta dónde `elementFromPoint` sigue
 * devolviendo el propio control (cuenta los pseudoelementos que amplían el área y descuenta lo que
 * otro control le pisa).
 */

const MIN_TARGET_PX = 44

interface Target {
  name: string
  width: number
  height: number
}

/** Controles visibles de la página cuya área efectiva no llega a `min` en alto o en ancho. */
function smallTargets(page: Page, min = MIN_TARGET_PX): Promise<Target[]> {
  return page.evaluate(async (minimum) => {
    const SELECTOR = 'a[href], button, [role="button"], input, select, textarea, summary'
    const controls = [...document.querySelectorAll<HTMLElement>(SELECTOR)].filter((element) => {
      const box = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return box.width > 1 && box.height > 1 && style.visibility !== 'hidden' && !element.closest('[inert]')
    })
    const small: { name: string; width: number; height: number }[] = []
    for (const control of controls) {
      control.scrollIntoView({ block: 'center', inline: 'center' })
      await new Promise((done) => requestAnimationFrame(() => done(null)))
      const box = control.getBoundingClientRect()
      const cx = box.left + box.width / 2
      const cy = box.top + box.height / 2
      const owns = (x: number, y: number) => {
        const hit = document.elementFromPoint(x, y)
        return !!hit && (hit === control || hit.closest(SELECTOR) === control)
      }
      const reach = (dx: number, dy: number) => {
        let steps = 0
        while (steps < minimum && owns(cx + dx * (steps + 1), cy + dy * (steps + 1))) steps++
        return steps
      }
      const width = owns(cx, cy) ? reach(-1, 0) + reach(1, 0) + 1 : 0
      const height = owns(cx, cy) ? reach(0, -1) + reach(0, 1) + 1 : 0
      if (width < minimum || height < minimum)
        small.push({
          name: (control.getAttribute('aria-label') ?? control.textContent ?? '').trim(),
          width,
          height,
        })
    }
    return small
  }, min)
}

test.describe('móvil táctil a 360 px', () => {
  test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true })

  for (const { name, path, heading } of [
    { name: 'la home', path: '/', heading: 'Beat Battle' },
    { name: 'una página provisional (Cómo funciona)', path: '/como-funciona', heading: 'Cómo funciona' },
    { name: 'la 404', path: '/esto-no-existe', heading: 'Página no encontrada' },
  ]) {
    test(`RNF-A11Y-09: todos los controles de ${name} tienen un área efectiva de 44 × 44 px`, async ({
      page,
    }) => {
      await open(page, path, heading)
      expect(await smallTargets(page)).toEqual([])
    })
  }
})
