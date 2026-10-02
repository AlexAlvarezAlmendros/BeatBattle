import { expect, type Page, test } from '@playwright/test'
import { open, openGallery, settle } from './support'

/**
 * «Reducir movimiento» del sistema emulado (`RNF-A11Y-03`, guía §2.17 y Anexo E): sin bucles, sin
 * desplazamientos y solo fundidos de ≤ 200 ms. Se registra cada animación que arranca desde la carga
 * (CSS y Web Animations) y se mira lo que sigue en marcha al asentarse la página.
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

  test('RNF-A11Y-03: la home no deja bucles en marcha y solo hace fundidos de ≤ 200 ms', async ({ page }) => {
    await page.addInitScript(recordAnimations)
    await open(page, '/', 'Beat Battle')
    await settle(page)
    // margen para que arranque cualquier bucle que esperase a la entrada
    await page.waitForTimeout(500)

    expect(await runningLoops(page)).toEqual([])
    const recorded = await page.evaluate(() => window.__bbAnimations)
    expect(recorded.filter((a) => a.iterations === Infinity)).toEqual([])
    expect(recorded.filter((a) => a.moves)).toEqual([])
    expect(recorded.filter((a) => a.duration > 200)).toEqual([])

    // Piezas con variante propia (Anexo E): orbes quietos, marquee estático y titular sin desplazar.
    const orbs = page.locator('.ambient-orbs__orb')
    await expect(orbs).toHaveCount(3)
    for (const orb of await orbs.all()) await expect(orb).toHaveCSS('animation-name', 'none')
    await expect(page.getByRole('marquee')).toHaveAttribute('data-static', 'true')
    for (const line of await page.locator('.hero-title__line').all())
      expect(await line.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).isIdentity)).toBe(true)
  })

  test('RNF-A11Y-03: la galería no deja bucles en marcha', async ({ page }) => {
    await openGallery(page)
    await settle(page)
    expect(await runningLoops(page)).toEqual([])
  })
})

test('RNF-A11Y-03 (control): sin la preferencia, la home sí tiene bucles (orbes y marquee)', async ({
  page,
}) => {
  // Garantiza que el test de arriba mide algo: el mismo recuento sin «reducir movimiento» no sale vacío.
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await open(page, '/', 'Beat Battle')
  const loops = await runningLoops(page)
  expect(loops).toEqual(expect.arrayContaining(['ambient-orb-drift-1', 'marquee-scroll']))
})
