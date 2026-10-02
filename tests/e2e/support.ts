import AxeBuilder from '@axe-core/playwright'
import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Ayudantes compartidos de los E2E (tarea 0.13): errores de la página, espera a que terminen las
 * entradas animadas, auditoría con axe y lectura del anillo de foco.
 */

/** Reglas de axe de WCAG 2.2 AA (objetivo de §2.17): A y AA de las versiones 2.0, 2.1 y 2.2. */
export const WCAG_22_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'] as const

/** Recoge los errores de JavaScript y de consola de la página (deben quedar vacíos). */
export function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  return errors
}

/**
 * Espera a que acaben las animaciones finitas (entrada del hero, fundidos): axe mide el contraste con
 * los colores del momento y un texto a medio aparecer daría falsos positivos. Las animaciones en bucle
 * (orbes, marquee, parpadeos) no terminan nunca y no cuentan.
 */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          animation.playState !== 'running' || animation.effect?.getTiming().iterations === Infinity,
      ),
  )
}

/**
 * Abre una página y espera a su `<h1>`: hasta que llega el trozo diferido de la primera página, el
 * marco no se pinta (`HydrateFallback`), así que antes no hay nada que enfocar ni que auditar.
 */
export async function open(page: Page, path: string, heading: string): Promise<void> {
  await page.goto(path)
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(heading)
}

/**
 * Abre la galería y espera a su cuerpo, que se carga aparte (`React.lazy`) y arrastra todos los
 * componentes: tarda más que la espera normal de `expect`, sobre todo con Vite en frío (el proyecto
 * `warmup` lo calienta antes de los E2E).
 */
export async function openGallery(page: Page, timeout = 30_000): Promise<void> {
  await page.goto('/dev/galeria')
  await expect(page.locator('section#cristal')).toBeVisible({ timeout })
}

/** Resumen legible de una violación de axe: regla, impacto, ayuda y los nodos afectados. */
function describe(violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations']): string {
  return violations
    .map((violation) => {
      const nodes = violation.nodes
        .map(
          (node) =>
            `    - ${node.target.join(' ')}\n      ${node.failureSummary?.replace(/\n/g, '\n      ')}`,
        )
        .join('\n')
      return `[${violation.impact}] ${violation.id}: ${violation.help} (${violation.helpUrl})\n${nodes}`
    })
    .join('\n\n')
}

/** Capas decorativas del fondo (`aria-hidden`): orbes rojos y rejilla y viñeta del hero. */
const DECORATIVE_BACKDROP = '.ambient-orbs, .hero__backdrop'

/**
 * Auditoría de axe con las reglas de WCAG 2.2 AA sobre la página entera. Falla con la lista de
 * violaciones. No se excluye ninguna regla: si alguna diera un falso positivo, se excluiría aquí con
 * un comentario que explique por qué.
 *
 * - Los bucles (parpadeo de la cuenta atrás, latidos, brillo del esqueleto) se llevan a su primer
 *   fotograma, el de reposo, y se congelan mientras axe mide: así el contraste se mide en el estado
 *   legible y no en un instante al azar del ciclo (el `:` de la cuenta atrás baja a opacidad 0,25 a
 *   mitad de su parpadeo). Al terminar siguen corriendo.
 * - Segunda pasada solo de `color-contrast` sin las capas decorativas del fondo: axe no sabe medir el
 *   contraste sobre un degradado y deja como «incompleto» casi todo el texto que pasa por encima de los
 *   orbes o de la rejilla del hero. Sin ellas mide contra el negro de base y lo verifica. (Los orbes, a
 *   opacidad ≤ 0,2, apenas aclaran el fondo; el contraste de cada par de tokens sobre su superficie lo
 *   comprueba además `contrast.test.ts` de la galería.)
 */
export async function expectNoAxeViolations(page: Page): Promise<void> {
  await settle(page)
  await page.evaluate(() => {
    const frozen = document
      .getAnimations()
      .filter(
        (animation) =>
          animation.playState === 'running' && animation.effect?.getTiming().iterations === Infinity,
      )
    for (const animation of frozen) {
      animation.pause()
      animation.currentTime = 0
    }
    ;(window as unknown as { __bbFrozen: Animation[] }).__bbFrozen = frozen
  })
  try {
    const { violations } = await new AxeBuilder({ page }).withTags([...WCAG_22_AA]).analyze()
    expect(violations, describe(violations)).toEqual([])

    const plain = await page.addStyleTag({ content: `${DECORATIVE_BACKDROP} { display: none !important; }` })
    const contrast = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
    await plain.evaluate((style) => (style as Element).remove())
    expect(contrast.violations, describe(contrast.violations)).toEqual([])
  } finally {
    await page.evaluate(() => {
      for (const animation of (window as unknown as { __bbFrozen: Animation[] }).__bbFrozen) animation.play()
    })
  }
}

/** Estilo del anillo de foco de un elemento: contorno y halo (`:focus-visible` de `global.css`). */
export function focusRing(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      focusVisible: element.matches(':focus-visible'),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineColor: style.outlineColor,
      boxShadow: style.boxShadow,
    }
  })
}

/**
 * Parte interior del halo de foco (`--bb-focus-halo`: 6 px de `--bb-red-wash`) tal y como la serializa
 * `getComputedStyle`. Ninguna sombra de reposo la lleva (el CTA ya tiene `--bb-shadow-cta`), así que
 * comprobar que aparece demuestra que el foco pinta el halo, no que haya una sombra cualquiera.
 */
export const FOCUS_HALO_SHADOW = 'rgba(255, 0, 60, 0.1) 0px 0px 0px 6px'

/**
 * Comprueba el foco visible de §2.17 (`RNF-A11Y-01`): el elemento tiene el foco, es `:focus-visible` y
 * pinta el anillo rojo de 2 px (`--bb-focus-color`, `#ff003c`) con su halo (`--bb-focus-halo`).
 */
export async function expectVisibleFocus(locator: Locator): Promise<void> {
  await expect(locator).toBeFocused()
  const ring = await focusRing(locator)
  expect(ring.focusVisible).toBe(true)
  expect(ring.outlineStyle).toBe('solid')
  expect(ring.outlineWidth).toBe('2px')
  expect(ring.outlineColor).toBe('rgb(255, 0, 60)')
  // La sombra tiene transición (el CTA pasa de su halo de reposo al de foco): se espera a que asiente.
  await expect.poll(async () => (await focusRing(locator)).boxShadow).toContain(FOCUS_HALO_SHADOW)
}
