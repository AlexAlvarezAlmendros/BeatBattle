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
 * `warmup` lo calienta antes de los E2E). El último bloque es «Portada y medallas».
 */
export async function openGallery(page: Page, timeout = 30_000): Promise<void> {
  await page.goto('/dev/galeria')
  await expect(page.locator('section#portada')).toBeVisible({ timeout })
}

/**
 * Las pantallas de la app (guía §2.18) con el `<h1>` de cada una, más la 404 y las dos de desarrollo
 * (`/dev/menu`, el menú con los datos de las maquetas, y la galería). Las comparten los E2E que
 * recorren «cada ruta» (`RD-VIS-02`, `RD-VIS-05`, `RNF-A11Y-02`).
 */
export const ROUTES = [
  { path: '/', heading: 'Beat Battle' },
  { path: '/dev/menu', heading: 'Beat Battle' },
  { path: '/semana/2026-41', heading: 'Semana' },
  { path: '/semana/2026-41/resultados', heading: 'Resultados' },
  { path: '/semanas', heading: 'Semanas' },
  { path: '/e/0192f3a1', heading: 'Entrada' },
  { path: '/jurado', heading: 'Modo Jurado' },
  { path: '/subir', heading: 'Subir mi beat' },
  { path: '/p/aina', heading: 'aina' },
  { path: '/salon-de-la-fama', heading: 'Salón de la fama' },
  { path: '/temporada/t4', heading: 'Temporada' },
  { path: '/como-funciona', heading: 'Cómo se juega' },
  { path: '/ajustes/cuenta', heading: 'Cuenta' },
  { path: '/entrar', heading: 'Entrar' },
  { path: '/registro', heading: 'Crear cuenta' },
  { path: '/verificar', heading: 'Verificar el email' },
  { path: '/recuperar', heading: 'Recuperar la contraseña' },
  { path: '/baja?token=no-vale', heading: 'Baja de emails' },
  { path: '/admin', heading: 'Administración' },
  { path: '/legal/bases', heading: 'Bases de la competición' },
  { path: '/esto-no-existe', heading: 'Bonus stage' },
] as const

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

/**
 * Capas decorativas (`aria-hidden`): la arena de detrás (cuña con trama, diagonal, rayos y viñeta) y la
 * trama de las tarjetas.
 */
const DECORATIVE_BACKDROP = '[data-wedge][aria-hidden], [data-halftone]'

/**
 * Auditoría de axe con las reglas de WCAG 2.2 AA sobre la página entera. Falla con la lista de
 * violaciones. No se excluye ninguna regla: si alguna diera un falso positivo, se excluiría aquí con
 * un comentario que explique por qué.
 *
 * - Los bucles (parpadeo de la cuenta atrás, latidos, brillo del esqueleto) se llevan a su primer
 *   fotograma, el de reposo, y se congelan mientras axe mide: así el contraste se mide en el estado
 *   legible y no en un instante al azar del ciclo (el `:` de la cuenta atrás baja a opacidad 0,25 a
 *   mitad de su parpadeo). Al terminar siguen corriendo.
 * - Segunda pasada solo de `color-contrast` sin las capas decorativas: axe no sabe medir el contraste
 *   sobre la cuña con trama ni sobre un lienzo y deja como «incompleto» el texto que pasa por encima.
 *   Sin ellas mide contra el fondo de su panel o el negro de base y lo verifica (todo texto sobre la
 *   cuña va en un panel o en su zona sin trama, `RD-VIS-05`; el contraste de cada par de tokens lo
 *   comprueba además `contrast.test.ts` de la galería).
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
      outlineOffset: style.outlineOffset,
      boxShadow: style.boxShadow,
    }
  })
}

/**
 * Halo del foco genérico (`--bb-focus-halo`: 10 px de rojo al 35 %, §3.2) tal y como lo serializa
 * `getComputedStyle`. Ninguna sombra de reposo lo lleva (en la arena solo hay sombras duras), así que
 * comprobar que aparece demuestra que el foco pinta el halo, no que haya una sombra cualquiera.
 */
export const FOCUS_HALO_SHADOW = 'rgba(255, 0, 60, 0.35) 0px 0px 0px 10px'

/**
 * Comprueba el foco genérico de §3.3 (`RNF-A11Y-01`): el elemento tiene el foco, es `:focus-visible` y
 * pinta el contorno blanco de 3 px (`--bb-stroke-cursor`) a 4 px (`--bb-cursor-gap`) con su halo
 * (`--bb-focus-halo`). Los menús de juego (`[data-cursor]`) usan el cursor, no este contorno.
 */
export async function expectVisibleFocus(locator: Locator): Promise<void> {
  await expect(locator).toBeFocused()
  const ring = await focusRing(locator)
  expect(ring.focusVisible).toBe(true)
  expect(ring.outlineStyle).toBe('solid')
  expect(ring.outlineWidth).toBe('3px')
  expect(ring.outlineOffset).toBe('4px')
  expect(ring.outlineColor).toBe('rgb(255, 255, 255)')
  // La sombra puede tener transición: se espera a que asiente.
  await expect.poll(async () => (await focusRing(locator)).boxShadow).toContain(FOCUS_HALO_SHADOW)
}

/**
 * Ancestro que recorta el anillo de foco de un elemento (contorno de 3 px a 4 px de distancia: 7 px
 * alrededor de la caja), o `null` si se ve entero. Mira `overflow`, `clip-path` y `contain: paint`.
 */
export function focusRingClippedBy(locator: Locator): Promise<string | null> {
  return locator.evaluate((element) => {
    const RING = 7
    const box = element.getBoundingClientRect()
    const ring = {
      left: box.left - RING,
      top: box.top - RING,
      right: box.right + RING,
      bottom: box.bottom + RING,
    }
    for (
      let node = element.parentElement;
      node && node !== document.documentElement;
      node = node.parentElement
    ) {
      const style = getComputedStyle(node)
      const clipsX = style.overflowX !== 'visible'
      const clipsY = style.overflowY !== 'visible'
      const clipsAll = style.clipPath !== 'none' || /paint|strict|content/.test(style.contain)
      if (!clipsX && !clipsY && !clipsAll) continue
      const rect = node.getBoundingClientRect()
      const outX = ring.left < rect.left || ring.right > rect.right
      const outY = ring.top < rect.top || ring.bottom > rect.bottom
      if (((clipsX || clipsAll) && outX) || ((clipsY || clipsAll) && outY))
        return `${node.tagName}.${node.className.toString()}`
    }
    return null
  })
}

/**
 * El cursor de juego de §3.3 (`RD-MOT-05`): el elemento tiene el foco y enseña su anillo (el marco
 * blanco de 3 px a 4 px que sigue su forma), en vez del contorno genérico.
 */
export async function expectCursor(locator: Locator): Promise<void> {
  await expect(locator).toBeFocused()
  await expect(locator).toHaveAttribute('data-cursor', '')
  await expect(locator.locator(':scope > [data-cursor-ring]')).toBeVisible()
  expect((await focusRing(locator)).outlineStyle).toBe('none')
}

/**
 * Reloj falso de Playwright sin el Escenario de WebGL (§3.5, 1.1). Con el reloj falso, el trozo del
 * Escenario se carga cuando la prueba avanza el tiempo, a mitad de lo que mide, y su evaluación ocupa el
 * hilo principal; las pruebas que avanzan el reloj miden otra cosa (la crónica, los bucles), así que van
 * con la arena estática (`bb:stage` = `off`).
 */
export async function installClockWithoutStage(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.setItem('bb:stage', 'off'))
  await page.clock.install()
}
