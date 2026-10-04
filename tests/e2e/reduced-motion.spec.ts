import { expect, type Page, test } from '@playwright/test'
import { open, openGallery, settle } from './support'

/**
 * «Reducir movimiento» del sistema emulado (`RNF-A11Y-03`, guía §2.17, §3.6 y Anexo E): sin bucles, sin
 * desplazamientos ni giros y solo fundidos de ≤ 200 ms, en la home, en el menú con semana en juego (el
 * vinilo-sol, la crónica, el cursor) y al cambiar de pantalla. Se registra cada animación que arranca
 * desde la carga (CSS y Web Animations) y se mira lo que sigue en marcha al asentarse la página.
 */

interface RecordedAnimation {
  source: 'css' | 'waapi'
  name: string
  duration: number
  iterations: number
  /** Cambia de valor alguna propiedad que mueve la pieza (transform, translate, scale, rotate…). */
  moves: boolean
}

declare global {
  interface Window {
    __bbAnimations: RecordedAnimation[]
  }
}

/**
 * Antes de cargar la app: registra cada animación CSS (`animationstart`) y cada `element.animate()`
 * (Motion usa Web Animations). Una animación «mueve» si alguna propiedad de posición, escala o giro
 * cambia de valor entre fotogramas: Motion repite `transform` aunque el valor no cambie (`y: 0` → `y: 0`).
 */
function recordAnimations() {
  const MOVING = /^(transform|translate|scale|rotate|top|left|right|bottom)$/i
  const recorded: RecordedAnimation[] = []
  window.__bbAnimations = recorded

  const normalize = (property: string, value: unknown): string => {
    const text = String(value)
    if (property !== 'transform') return text
    try {
      return new DOMMatrix(text === 'none' ? undefined : text).toString()
    } catch {
      return text
    }
  }
  const record = (source: RecordedAnimation['source'], name: string, animation: Animation | undefined) => {
    const timing = animation?.effect?.getTiming()
    const frames = (animation?.effect as KeyframeEffect | null)?.getKeyframes() ?? []
    const properties = new Set(
      frames.flatMap((frame) => Object.keys(frame).filter((key) => MOVING.test(key))),
    )
    recorded.push({
      source,
      name,
      duration: Number(timing?.duration ?? 0),
      iterations: Number(timing?.iterations ?? 1),
      moves: [...properties].some(
        (property) => new Set(frames.map((frame) => normalize(property, frame[property]))).size > 1,
      ),
    })
  }

  const nativeAnimate = Element.prototype.animate
  Element.prototype.animate = function (this: Element, keyframes, options) {
    const animation = nativeAnimate.call(this, keyframes, options)
    record('waapi', this.className.toString() || this.tagName, animation)
    return animation
  }
  document.addEventListener(
    'animationstart',
    (event) => {
      const animation = (event.target as Element)
        .getAnimations()
        .find((a) => (a as CSSAnimation).animationName === event.animationName)
      record('css', event.animationName, animation)
    },
    true,
  )
}

/**
 * Espera a la última carga diferida de la página: la parte animada de la zona de avisos (`ToastList`), que
 * se pide tras la primera pintura con el navegador libre. Lo que arranque con ella ya está registrado al
 * volver (dos fotogramas después de que llegue el trozo).
 */
async function deferredLoaded(page: Page, loading: Promise<unknown>): Promise<void> {
  await loading
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(null)))),
  )
}

/** Respuesta del trozo diferido de los avisos (en desarrollo, el módulo `ToastList.tsx`). */
const toastListResponse = (page: Page) =>
  page.waitForResponse((response) => response.url().includes('ToastList'))

/** Animaciones en marcha que no terminan nunca (bucles). */
function runningLoops(page: Page) {
  return page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations === Infinity)
      .map(
        (a) =>
          (a as CSSAnimation).animationName ?? String((a.effect as KeyframeEffect | null)?.target?.className),
      ),
  )
}

test.describe('con «reducir movimiento» del sistema', () => {
  test.use({ reducedMotion: 'reduce' })

  for (const { path, name } of [
    { path: '/', name: 'la home' },
    { path: '/dev/menu', name: 'el menú con semana en juego' },
  ]) {
    test(`RNF-A11Y-03: ${name} no deja bucles en marcha y solo hace fundidos de ≤ 200 ms`, async ({
      page,
    }) => {
      await page.addInitScript(recordAnimations)
      const deferred = toastListResponse(page)
      await open(page, path, 'Beat Battle')
      // Lo último que carga es la zona de avisos diferida: cualquier bucle ya ha arrancado.
      await deferredLoaded(page, deferred)
      // El cursor de juego también salta sin movimiento.
      await page.keyboard.press('ArrowDown')
      await settle(page)

      expect(await runningLoops(page)).toEqual([])
      const recorded = await page.evaluate(() => window.__bbAnimations)
      expect(recorded.filter((a) => a.iterations === Infinity)).toEqual([])
      expect(recorded.filter((a) => a.moves)).toEqual([])
      expect(recorded.filter((a) => a.duration > 200)).toEqual([])
      // La crónica de la arena cambia sin fundido (Anexo E, §3.6).
      await expect(page.locator('[data-chronicle]')).toHaveAttribute('data-static', 'true')
    })
  }

  /**
   * La crónica es información, no un bucle decorativo (§3.6 v0.6.6; cuarto pase del jurado de la 0.28, F4):
   * con «reducir movimiento» se quedaba para siempre en «Inserta tu beat · Crédito 01» y el recuento de
   * votos («340 votos esta semana») no estaba en ninguna otra parte. Sigue rotando cada 5 s, sin fundido,
   * y el botón «Pausar las animaciones» sigue ahí y la para (WCAG 2.2.2). Con el reloj de la página falso.
   */
  test('RNF-A11Y-03 / WCAG 2.2.2: en /dev/menu la crónica sigue rotando sin fundido y el botón de pausa la para', async ({
    page,
  }) => {
    await page.clock.install()
    await open(page, '/dev/menu', 'Beat Battle')
    await page.mouse.move(0, 0)
    const bar = page.getByRole('contentinfo')
    const chronicle = bar.locator('[data-chronicle]')
    await expect(chronicle).toHaveAttribute('data-static', 'true')
    await expect(chronicle).toContainText('Inserta tu beat')
    await page.clock.runFor(5_000)
    await expect(chronicle).toContainText('Nueva entrada')
    expect(await chronicle.evaluate((element) => element.getAnimations({ subtree: true }).length)).toBe(0)
    await page.clock.runFor(10_000)
    await expect(chronicle).toContainText('votos esta semana')

    const pause = bar.getByRole('button', { name: 'Pausar las animaciones' })
    await expect(pause).toHaveAttribute('aria-pressed', 'false')
    await pause.click()
    await expect(pause).toHaveAttribute('aria-pressed', 'true')
    // Sin el ratón encima ni el foco dentro: lo que la para es el botón.
    await page.mouse.move(0, 0)
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    const paused = await chronicle.textContent()
    await page.clock.runFor(15_000)
    await expect(chronicle).toHaveText(paused ?? '')
  })

  test('RNF-A11Y-03: cambiar de pantalla es un fundido, sin barrido de la diagonal', async ({ page }) => {
    await page.addInitScript(recordAnimations)
    await open(page, '/', 'Beat Battle')
    await page.getByRole('menuitem', { name: /^Cómo se juega/ }).click()
    await expect(page).toHaveURL('/como-funciona')
    await settle(page)
    await expect(page.locator('.screen-sweep')).toBeHidden()
    const recorded = await page.evaluate(() => window.__bbAnimations)
    expect(recorded.filter((a) => a.moves)).toEqual([])
    expect(recorded.filter((a) => a.duration > 200)).toEqual([])
  })

  test('RNF-A11Y-03: la galería no deja bucles en marcha', async ({ page }) => {
    await openGallery(page)
    await settle(page)
    expect(await runningLoops(page)).toEqual([])
  })
})

test('RNF-A11Y-03 (control): sin la preferencia, el menú con semana sí tiene bucles (el vinilo-sol gira)', async ({
  page,
}) => {
  // Garantiza que los tests de arriba miden algo: con el mismo registrador y las mismas esperas, sin
  // «reducir movimiento» salen bucles, giros y animaciones de más de 200 ms.
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.addInitScript(recordAnimations)
  const deferred = toastListResponse(page)
  await open(page, '/dev/menu', 'Beat Battle')
  await deferredLoaded(page, deferred)
  const recorded = await page.evaluate(() => window.__bbAnimations)
  expect(recorded.some((a) => a.iterations === Infinity)).toBe(true)
  expect(recorded.some((a) => a.moves)).toBe(true)
  expect(recorded.some((a) => a.duration > 200)).toBe(true)
})

/**
 * Pausa de la página (WCAG 2.2.2, nivel A; guía §3.6 «Bucles» y §3.8.3): los bucles decorativos (el
 * vinilo-sol, el respiro de «Inserta tu beat», el latido del reloj en la última hora y la rotación de la
 * crónica) se paran con el botón de pausa de la barra, sin depender de «reducir movimiento» del sistema.
 */
test.describe('pausa de los bucles (WCAG 2.2.2)', () => {
  test.use({ reducedMotion: 'no-preference' })

  test('WCAG 2.2.2: el botón de pausa de la barra para todos los bucles del menú, no solo la crónica', async ({
    page,
  }) => {
    await open(page, '/dev/menu', 'Beat Battle')
    await settle(page)
    // En marcha: el vinilo-sol y el respiro de «Inserta tu beat».
    expect((await runningLoops(page)).length).toBeGreaterThanOrEqual(2)
    const pause = page.getByRole('contentinfo').getByRole('button', { name: 'Pausar las animaciones' })
    await expect(pause).toHaveAttribute('aria-pressed', 'false')
    await pause.click()
    await expect(pause).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('html')).toHaveAttribute('data-loops', 'paused')
    await expect.poll(() => runningLoops(page)).toEqual([])
    // La crónica tampoco cambia (también con el ratón fuera).
    await page.mouse.move(0, 0)
    const chronicle = page.locator('[data-chronicle]')
    const before = await chronicle.textContent()
    await page.waitForTimeout(5_500)
    await expect(chronicle).toHaveText(before ?? '')
    // Al reanudar, el vinilo sigue girando.
    await pause.click()
    await expect(page.locator('html')).not.toHaveAttribute('data-loops', 'paused')
    await expect.poll(async () => (await runningLoops(page)).length).toBeGreaterThanOrEqual(2)
  })

  test('WCAG 2.2.2: la pausa también para el latido del reloj de ronda en la última hora', async ({
    page,
  }) => {
    await openGallery(page)
    const clock = page.locator('[data-phase="final"]').first()
    await clock.scrollIntoViewIfNeeded()
    const heartbeats = () => clock.evaluate((element) => element.getAnimations().length)
    await expect.poll(heartbeats).toBe(1)
    await page.evaluate(() => document.documentElement.setAttribute('data-loops', 'paused'))
    await expect.poll(heartbeats).toBe(0)
  })

  test.describe('móvil táctil (390 × 844)', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

    test('WCAG 2.2.2: sin la crónica a la vista no queda ningún bucle en marcha (el vinilo oculto no gira)', async ({
      page,
    }) => {
      await open(page, '/dev/menu', 'Beat Battle')
      await settle(page)
      await expect(page.locator('[data-chronicle]')).toBeHidden()
      expect(await runningLoops(page)).toEqual([])
    })
  })
})
