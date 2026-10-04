import { expect, type Page, test } from '@playwright/test'
import { open, openGallery } from './support'

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

/**
 * Controles visibles de la página cuya área efectiva no llega a `min` en alto o en ancho. Con `scope`,
 * solo los de dentro de ese elemento; con `skip`, sin los que casan con ese selector.
 */
function smallTargets(
  page: Page,
  { min = MIN_TARGET_PX, scope = 'body', skip }: { min?: number; scope?: string; skip?: string } = {},
): Promise<Target[]> {
  return page.evaluate(
    async ({ minimum, scope, skip }) => {
      const SELECTOR =
        'a[href], button, [role="button"], [role="menuitem"], [role="tab"], input, select, textarea, summary'
      const root = document.querySelector(scope)!
      const controls = [...root.querySelectorAll<HTMLElement>(SELECTOR)].filter((element) => {
        const box = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return (
          box.width > 1 &&
          box.height > 1 &&
          style.visibility !== 'hidden' &&
          !element.closest('[inert]') &&
          !(skip && element.matches(skip))
        )
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
    },
    { minimum: min, scope, skip },
  )
}

test.describe('móvil táctil a 360 px', () => {
  test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true })

  for (const { name, path, heading } of [
    { name: 'la home', path: '/', heading: 'Beat Battle' },
    { name: 'el menú con semana en juego', path: '/dev/menu', heading: 'Beat Battle' },
    { name: 'una pantalla interior (Cómo se juega)', path: '/como-funciona', heading: 'Cómo se juega' },
    { name: 'Opciones', path: '/ajustes/cuenta', heading: 'Cuenta' },
    { name: 'la 404', path: '/esto-no-existe', heading: 'Bonus stage' },
  ]) {
    test(`RNF-A11Y-09: todos los controles de ${name} tienen un área efectiva de 44 × 44 px`, async ({
      page,
    }) => {
      await open(page, path, heading)
      expect(await smallTargets(page)).toEqual([])
    })
  }
})

/**
 * La fila de entrada de la galería en un móvil táctil (tercer pase del jurado, L9): el enlace a la ficha
 * (título y subtítulo) medía 109 × 39 px. Se audita el bloque de la fila, con todos sus estados salvo el
 * «pulsado» forzado, que es el instante de la pulsación (encoge a 0,97 a propósito, §3.3).
 */
test.describe('galería a 390 × 844 táctil', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('RNF-A11Y-09: el play y el enlace de título y subtítulo de la fila de entrada tienen un área efectiva de 44 × 44 px', async ({
    page,
  }) => {
    await openGallery(page)
    const links = page.locator('section#fila').getByRole('link', { name: 'Neón en Sants' })
    expect(await links.count()).toBeGreaterThan(0)
    expect(await smallTargets(page, { scope: 'section#fila', skip: '[data-force-state="pressed"]' })).toEqual(
      [],
    )
  })
})
