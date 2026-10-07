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
 * Dónde queda una pieza enfocada (se evalúa en la página con el elemento): si está dentro de la barra de
 * controles, si cabe entera en la ventana, si su foco cabe y cuánto la tapa la barra si va en el
 * contenido. El foco es el contorno (3 px a 4 px de la caja) y el halo (`--bb-focus-halo`, 10 px), con lo
 * que de ellos deje ver un `clip-path` del propio control (jurado de la 0.28, L6). Autónoma: Playwright la
 * pasa a la página tal cual.
 */
function measureFocus(element: Element) {
  const style = getComputedStyle(element)
  const px = (value: string) => Number.parseFloat(value) || 0
  const outline = style.outlineStyle === 'none' ? 0 : px(style.outlineOffset) + px(style.outlineWidth)
  // Extensión de la sombra (el último valor en px de `box-shadow`) y lo que deja ver un `inset()`.
  const spread = style.boxShadow === 'none' ? 0 : px(style.boxShadow.match(/(-?[\d.]+)px\s*$/)?.[1] ?? '0')
  const clip = style.clipPath.startsWith('inset(') ? -px(style.clipPath.slice(6)) : Number.POSITIVE_INFINITY
  const extent = Math.max(outline, Math.min(spread, clip))
  const box = element.getBoundingClientRect()
  const ring = {
    left: box.left - extent,
    top: box.top - extent,
    right: box.right + extent,
    bottom: box.bottom + extent,
  }
  const bar = document.querySelector('footer')
  const inBar = !!bar?.contains(element)
  const barBox = bar?.getBoundingClientRect()
  const position = bar ? getComputedStyle(bar).position : 'static'
  // Si la barra flota sobre el contenido, lo que quede por debajo de su borde superior está tapado.
  const floats = position === 'sticky' || position === 'fixed'
  const covered =
    !inBar && floats && barBox && barBox.top < window.innerHeight ? Math.max(0, box.bottom - barBox.top) : 0
  const label = (element.getAttribute('aria-label') ?? element.textContent ?? element.tagName)
    .trim()
    .slice(0, 32)
  return {
    focusVisible: element.matches(':focus-visible'),
    inBar,
    inside: box.top >= -0.5 && box.bottom <= window.innerHeight + 0.5,
    ringInside:
      ring.left >= -0.5 &&
      ring.top >= -0.5 &&
      ring.right <= window.innerWidth + 0.5 &&
      ring.bottom <= window.innerHeight + 0.5,
    covered,
    label,
    key: `${element.tagName}|${label}|${element.getAttribute('href') ?? ''}`,
    where: `${box.top.toFixed(1)}–${box.bottom.toFixed(1)} (ventana ${window.innerHeight}, desplazada ${Math.round(window.scrollY)})`,
    ring: `${ring.left.toFixed(1)},${ring.top.toFixed(1)} → ${ring.right.toFixed(1)},${ring.bottom.toFixed(1)}`,
  }
}

/**
 * Lo que se sale de la ventana del foco de cada control de la barra de controles (jurado de la 0.28,
 * L6). Se enfoca cada uno con el teclado ya en uso (Tab antes), para que sea `:focus-visible`.
 */
async function barRingsOutsideWindow(page: Page): Promise<string[]> {
  await page.keyboard.press('Tab')
  const controls = page.getByRole('contentinfo').locator('a[href], button')
  const outside: string[] = []
  for (const control of await controls.all()) {
    if (!(await control.isVisible())) continue
    await control.focus()
    const result = await control.evaluate(measureFocus)
    if (!result.focusVisible) outside.push(`${result.label}: sin :focus-visible`)
    else if (!result.ringInside) outside.push(`${result.label}: ${result.ring}`)
  }
  return outside
}

/** Deja pasar dos fotogramas: el desplazamiento al foco es instantáneo, pero se mide ya pintado. */
function nextFrame(page: Page): Promise<unknown> {
  return page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
}

/**
 * Espera a que la pantalla quede quieta tras mover el cursor: el menú vuelve a traer la placa a la vista
 * cuando acaban las transiciones de alto de las placas (`--bb-dur-tick`, `useRevealHelp`), así que lo que
 * cuenta es la posición del final, no la del primer fotograma. Con la máquina cargada, dos fotogramas no
 * bastaban (fallo intermitente a 320×256: «Jurado: entero=false»).
 */
function settled(page: Page): Promise<unknown> {
  return page.evaluate(async () => {
    const running = document.getAnimations().filter((animation) => animation.playState === 'running')
    const finite = running.filter(
      (animation) => animation.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY,
    )
    await Promise.allSettled(finite.map((animation) => animation.finished))
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
  })
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
      await settled(page)
      const { label, covered, inside } = await focusedVersusBar(page)
      if (covered > 0.5 || !inside)
        problems.push(`${label}: tapado ${covered.toFixed(1)} px, entero=${inside}`)
    }
    expect(problems).toEqual([])
  })
}

/**
 * Con las flechas repetidas deprisa (la repetición de una tecla mantenida, o pulsaciones a menos de lo que
 * dura la transición de la placa elegida), la placa enfocada sigue entera a la vista (revisión del cierre de
 * la 0.28): al mover el cursor, el menú trae a la vista también el panel de ayuda (§3.8.3), y lo que dejaba
 * esperando un movimiento viejo (el final de la transición de su placa) volvía a desplazar la pantalla hasta
 * esa placa, que ya no tenía el foco. A 640 × 360, ↓ seis veces cada 40 ms dejaba «Jugar» enfocada a −21 px.
 */
for (const viewport of [
  { width: 320, height: 256, name: '1280 px al 400 %' },
  { width: 640, height: 360, name: '1280 × 720 al 200 %' },
  { width: 1024, height: 768, name: 'composición intermedia' },
  { width: 823, height: 514, name: '1440 × 900 al 175 %' },
]) {
  test(`RNF-A11Y-01 / §3.3 / WCAG 2.4.11: a ${viewport.width}×${viewport.height} (${viewport.name}), con las flechas repetidas deprisa, la placa enfocada queda entera a la vista`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await open(page, '/dev/menu', 'Beat Battle')
    const problems: string[] = []
    for (const [keys, delay] of [
      [['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown'], 40],
      [['ArrowUp', 'ArrowUp', 'ArrowUp'], 0],
      [['End', 'Home'], 20],
    ] as const) {
      for (const key of keys) {
        await page.keyboard.press(key)
        if (delay) await page.waitForTimeout(delay)
      }
      // Lo que tarden en acabar las transiciones de las placas (`--bb-dur-tick`) y algo más.
      await page.waitForTimeout(500)
      const { label, covered, inside } = await focusedVersusBar(page)
      if (covered > 0.5 || !inside)
        problems.push(`${keys.join(' ')} → ${label}: tapado ${covered.toFixed(1)} px, entero=${inside}`)
    }
    expect(problems).toEqual([])
  })
}

/**
 * Recorrido con Tab de cada pantalla con teclado y ratón en ventanas pequeñas (revisión del cuarto pase
 * del jurado de la 0.28, sobre F2). Con la barra despegada, «Legal» y la pausa de la crónica cuelgan por
 * debajo de la ventana dentro de una barra `sticky` (solo la fila de la firma sigue pegada, §3.4.1 v0.6.6)
 * y, al llegar con Tab, el navegador no desplazaba lo bastante: a 360 × 640, 375 × 667 y 320 × 568, en
 * /como-funciona «Legal» quedaba entero fuera de la ventana y solo asomaba el borde de su anillo. Se pulsa
 * Tab como un usuario de teclado hasta dar la vuelta: cada control de la barra tiene que verse entero, con
 * su anillo, y cada control del contenido, entero y sin la parte pegada de la barra encima.
 */
for (const { width, height } of [
  { width: 320, height: 568 },
  { width: 360, height: 640 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 720, height: 450 },
  { width: 823, height: 514 },
]) {
  test.describe(`recorrido con Tab a ${width} × ${height} con teclado y ratón`, () => {
    test.use({ viewport: { width, height } })

    for (const { path, heading } of [
      { path: '/como-funciona', heading: 'Cómo se juega' },
      { path: '/ajustes/sonido', heading: 'Sonido y efectos' },
      { path: '/legal/bases', heading: 'Bases de la competición' },
      { path: '/esto-no-existe', heading: 'Bonus stage' },
      { path: '/entrar', heading: 'Entrar' },
      { path: '/dev/menu', heading: 'Beat Battle' },
    ]) {
      test(`RD-VIS-02 b / RNF-A11Y-01 / WCAG 2.4.11 (§3.4.1): en ${path}, cada control al que se llega con Tab se ve entero; los de la barra, con su anillo`, async ({
        page,
      }) => {
        await open(page, path, heading)
        const problems: string[] = []
        const seen = new Set<string>()
        let barControls = 0
        for (let step = 0; step < 40; step++) {
          await page.keyboard.press('Tab')
          await nextFrame(page)
          // Pasada la última pieza, el foco sale de la página (al <body>) antes de dar la vuelta.
          if (await page.evaluate(() => !document.activeElement || document.activeElement === document.body))
            continue
          const focused = await page.evaluateHandle(() => document.activeElement as Element)
          const state = await focused.evaluate(measureFocus)
          if (seen.has(state.key)) break
          seen.add(state.key)
          if (state.inBar) {
            barControls++
            await expect(page.locator(':focus'), `${state.label}, entero en la ventana`).toBeInViewport({
              ratio: 1,
            })
            if (!state.ringInside) problems.push(`[barra] ${state.label}: anillo ${state.ring}`)
          } else if (!state.inside || state.covered > 0.5)
            problems.push(`${state.label}: ${state.where}, tapado ${state.covered.toFixed(1)} px`)
        }
        expect(
          barControls,
          'controles de la barra recorridos (la firma y «Legal» o la pausa)',
        ).toBeGreaterThanOrEqual(2)
        expect(problems).toEqual([])
      })
    }
  })
}

/**
 * El anillo del foco tampoco se corta por el borde de arriba de la ventana (§3.3 v0.6.7: «ni cortado por
 * el borde de la ventana», `scroll-padding` arriba; tercer pase del jurado sobre la v0.6.6, B2). A
 * 1024 × 768 en /dev/menu, al dar la vuelta con Tab de la barra a «Saltar al contenido» y al botón de
 * sonido del HUD, el navegador desplazaba lo justo para enseñar el botón (scrollY 22) y lo dejaba en
 * top 0, con el borde de arriba de su anillo (3 + 4 px) y el halo fuera de la ventana. Pasa siempre que
 * el control enfocado asoma a medias por arriba: el navegador lo alinea con el borde. Los controles del
 * contenido llevan su `scroll-margin-top`; los del HUD, no.
 */
test.describe('anillo del foco por arriba a 1024 × 768 con teclado', () => {
  test.use({ viewport: { width: 1024, height: 768 } })

  for (const scrolled of [10, 22, 44]) {
    test(`RNF-A11Y-01 / §3.3 / WCAG 2.4.11: en /dev/menu desplazado ${scrolled} px, al volver con Tab al botón de sonido del HUD su anillo y su halo caben en la ventana`, async ({
      page,
    }) => {
      await open(page, '/dev/menu', 'Beat Battle')
      const sound = page.locator('header').getByRole('button', { name: /^Sonido/ })
      // Con el teclado ya en uso: «Saltar al contenido» y el botón de sonido.
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
      await expect(sound).toBeFocused()
      // La pantalla, algo desplazada (con la rueda, o al volver de la barra) y Tab desde «Saltar al
      // contenido», que va fijo y no desplaza.
      await page.evaluate((top) => window.scrollTo(0, top), scrolled)
      await page.keyboard.press('Shift+Tab')
      await page.keyboard.press('Tab')
      await expect(sound).toBeFocused()
      await nextFrame(page)
      const state = await sound.evaluate(measureFocus)
      expect(state.focusVisible).toBe(true)
      expect(state.ringInside, `anillo ${state.ring}; botón ${state.where}`).toBe(true)
    })
  }

  test('RNF-A11Y-01 / §3.3 / WCAG 2.4.11: en /dev/menu, dando dos vueltas con Tab, ningún anillo se corta por arriba', async ({
    page,
  }) => {
    await open(page, '/dev/menu', 'Beat Battle')
    const problems: string[] = []
    let rounds = 0
    for (let step = 0; step < 40 && rounds < 2; step++) {
      await page.keyboard.press('Tab')
      await nextFrame(page)
      if (await page.evaluate(() => !document.activeElement || document.activeElement === document.body)) {
        rounds++
        continue
      }
      const state = await page.evaluate(() => {
        const element = document.activeElement as Element
        const style = getComputedStyle(element)
        const px = (value: string) => Number.parseFloat(value) || 0
        const outline = style.outlineStyle === 'none' ? 0 : px(style.outlineOffset) + px(style.outlineWidth)
        const spread =
          style.boxShadow === 'none' ? 0 : px(style.boxShadow.match(/(-?[\d.]+)px\s*$/)?.[1] ?? '0')
        const top = element.getBoundingClientRect().top - Math.max(outline, spread)
        return {
          top,
          label: (element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 32),
        }
      })
      if (state.top < -0.5) problems.push(`${state.label}: anillo desde ${state.top.toFixed(1)}`)
    }
    expect(rounds, 'dos vueltas').toBe(2)
    expect(problems).toEqual([])
  })
})
