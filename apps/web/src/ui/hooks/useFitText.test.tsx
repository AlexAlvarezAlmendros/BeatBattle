import { act, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { onTextStyleChange, useFitText } from './useFitText'

/**
 * jsdom no maqueta ni tiene `ResizeObserver`: se simula uno que guarda sus elementos (para avisar a mano
 * cuando «cambia» el tamaño de la sonda) y los fotogramas van con temporizadores.
 */
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = []
  readonly targets = new Set<Element>()
  constructor(readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this)
  }
  observe(target: Element) {
    this.targets.add(target)
  }
  unobserve(target: Element) {
    this.targets.delete(target)
  }
  disconnect() {
    this.targets.clear()
  }
  /** Avisa como si hubiera cambiado el tamaño de `target`. */
  static resize(target: Element) {
    for (const observer of FakeResizeObserver.instances)
      if (observer.targets.has(target)) observer.callback([], observer as unknown as ResizeObserver)
  }
}

/** La sonda de texto de `onTextStyleChange` (en `<body>`). */
const probe = () => document.querySelector<HTMLElement>('[data-text-style-probe] span')

/** Deja pasar las microtareas (`MutationObserver`) y el fotograma siguiente. */
async function nextFrame() {
  await act(async () => {
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(20)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 16),
  )
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
})

afterEach(() => {
  FakeResizeObserver.instances = []
  for (const style of document.head.querySelectorAll('style[data-test]')) style.remove()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('onTextStyleChange', () => {
  it('RD-VIS-05 / WCAG 1.4.12: avisa cuando entra una hoja de estilo en <head> con la página ya cargada', async () => {
    const listener = vi.fn()
    const off = onTextStyleChange(listener)
    const style = document.createElement('style')
    style.dataset.test = ''
    style.textContent = '* { letter-spacing: 0.12em !important; }'
    document.head.append(style)
    await nextFrame()
    expect(listener).toHaveBeenCalledTimes(1)
    // Y cuando se quita (el marcador que se apaga).
    style.remove()
    await nextFrame()
    expect(listener).toHaveBeenCalledTimes(2)
    off()
  })

  it('RD-VIS-05: no avisa por cambios de <head> que no son de estilo (el título de la pantalla)', async () => {
    const listener = vi.fn()
    const off = onTextStyleChange(listener)
    const title = document.createElement('title')
    document.head.append(title)
    title.textContent = 'Beat Battle'
    await nextFrame()
    expect(listener).not.toHaveBeenCalled()
    title.remove()
    off()
  })

  it('RD-VIS-05 / WCAG 1.4.12: avisa cuando cambia el tamaño de la sonda de texto (CSS que no viene de ningún nodo)', async () => {
    const listener = vi.fn()
    const off = onTextStyleChange(listener)
    const element = probe()
    expect(element).not.toBeNull()
    // Mismo tamaño: nada (el aviso inicial del observador no cuenta).
    FakeResizeObserver.resize(element!)
    await nextFrame()
    expect(listener).not.toHaveBeenCalled()
    vi.spyOn(element!, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 240, 30))
    FakeResizeObserver.resize(element!)
    await nextFrame()
    expect(listener).toHaveBeenCalledTimes(1)
    off()
  })

  it('RD-VIS-05: una sola sonda para todos los oyentes, que se retira con el último', () => {
    const offA = onTextStyleChange(() => {})
    const offB = onTextStyleChange(() => {})
    expect(document.querySelectorAll('[data-text-style-probe]')).toHaveLength(1)
    offA()
    expect(document.querySelectorAll('[data-text-style-probe]')).toHaveLength(1)
    offB()
    expect(document.querySelectorAll('[data-text-style-probe]')).toHaveLength(0)
  })
})

/** Un texto ajustado, con su ancho de contenido simulado (`scrollWidth`) frente al de su caja (200 px). */
function Fitted({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useFitText(ref, text)
  return (
    <div>
      <span ref={ref} data-testid="fitted">
        {text}
      </span>
    </div>
  )
}

describe('useFitText', () => {
  it('§3.3 / WCAG 1.4.12: si el texto deja de caber sin que cambie su caja (espaciado aplicado después de cargar), se reajusta', async () => {
    let contentWidth = 180
    const { getByTestId, unmount } = render(<Fitted text="Resultados" />)
    const element = getByTestId('fitted')
    Object.defineProperty(element, 'clientWidth', { configurable: true, get: () => 200 })
    Object.defineProperty(element, 'scrollWidth', { configurable: true, get: () => contentWidth })
    await nextFrame()
    expect(element.style.fontStretch).toBe('')
    // El espaciado de 1.4.12 llega con la página cargada: el texto pasa a medir más que su caja.
    contentWidth = 231
    const style = document.createElement('style')
    style.dataset.test = ''
    style.textContent = '* { letter-spacing: 0.12em !important; }'
    document.head.append(style)
    await nextFrame()
    // Ha bajado la anchura del display hasta la mínima (jsdom no da cuerpo de CSS para seguir bajando).
    expect(element.style.fontStretch).toBe('105%')
    unmount()
    expect(document.querySelector('[data-text-style-probe]')).toBeNull()
  })
})
