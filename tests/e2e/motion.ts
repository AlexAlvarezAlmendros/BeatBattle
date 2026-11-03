import type { Page } from '@playwright/test'

/**
 * Registro de animaciones para las pruebas de movimiento (`RNF-A11Y-03`, Anexo E): qué arranca desde la carga (CSS y
 * Web Animations), si mueve algo y cuánto dura, y qué bucles siguen en marcha. Lo usan `reduced-motion.spec.ts` y
 * `game-quiet.spec.ts`.
 */

export interface RecordedAnimation {
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
export function recordAnimations() {
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
export function runningLoops(page: Page) {
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
