import { type RefObject, useLayoutEffect } from 'react'

/** Paso de la anchura al encoger, en puntos porcentuales. */
const STRETCH_STEP = 5
/** Cuerpo mínimo del alias, en px (§3.3 «Ficha de luchador»: «después el cuerpo hasta 30 px»). */
export const FIT_MIN_FONT_PX = 30

export interface FitTextOptions {
  /**
   * Token de anchura del que se parte (por defecto, `--bb-stretch-display`, 150 %: el alias y el título
   * del escenario). Las placas del menú parten de `--bb-stretch-plate` (125 %).
   */
  fromStretch?: string
  /** Cuerpo mínimo en px (por defecto, 30: el del alias). Nunca por debajo de 12 (`RD-VIS-05`). */
  minFontPx?: number
  /**
   * Cambia cuando el texto cambia de tamaño de CSS sin cambiar de caja (la placa elegida pasa de 25 a
   * 31 px): se vuelve a ajustar desde el tamaño nuevo.
   */
  state?: unknown
}

/** Valor numérico de un token de anchura (`--bb-stretch-display` → 150), leído del CSS. */
function stretchToken(name: string, fallback: number): number {
  const value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name))
  return Number.isFinite(value) ? value : fallback
}

/** Mínimo legible (`RD-VIS-05`): ningún ajuste baja de 12 px. */
const FLOOR_FONT_PX = 12

/** Texto de la sonda: letras, cifras y espacios (el espaciado entre palabras también cuenta). */
const PROBE_TEXT = 'Beat Battle 01 · Ajustes'

const textStyleListeners = new Set<() => void>()
let stopWatchingTextStyle: (() => void) | null = null

/** Una hoja de estilo en el DOM: `<style>` o `<link rel="stylesheet">`. */
function isStyleSheetNode(node: Node | null): boolean {
  if (node instanceof HTMLStyleElement) return true
  return node instanceof HTMLLinkElement && /\bstylesheet\b/i.test(node.rel)
}

/** Si un cambio de `<head>` toca alguna hoja de estilo (y no, por ejemplo, el `<title>` de la pantalla). */
function touchesStyleSheets(record: MutationRecord): boolean {
  if (record.type === 'childList')
    return (
      isStyleSheetNode(record.target) ||
      [...record.addedNodes, ...record.removedNodes].some((node) => isStyleSheetNode(node))
    )
  if (record.type === 'characterData') return isStyleSheetNode(record.target.parentNode)
  return isStyleSheetNode(record.target)
}

/**
 * Empieza a vigilar el estilo del texto de la página (una sola vez para todos los oyentes):
 *
 * - **Hojas de estilo** que entran, salen o cambian en `<head>` (lo que hace un marcador de espaciado de
 *   texto, o una extensión que inyecta su `<style>`).
 * - **Una sonda de texto** (un `<span>` invisible de ancho `max-content` en `<body>`, dentro de una caja de
 *   0 × 0 que lo recorta): su tamaño cambia con el espaciado entre letras y palabras, el interlineado o el
 *   cuerpo que le lleguen por herencia o por una regla general, también si no vienen de ningún nodo (el CSS
 *   de una extensión, `adoptedStyleSheets`).
 *
 * Avisa a los oyentes en el fotograma siguiente, una vez por fotograma. Los ajustes de los oyentes (estilos
 * en línea de sus textos) no tocan `<head>` ni la sonda: no hay bucle.
 */
function watchTextStyle(): () => void {
  let frame = 0
  const notify = () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      for (const listener of [...textStyleListeners]) listener()
    })
  }
  const sheets = new MutationObserver((records) => {
    if (records.some(touchesStyleSheets)) notify()
  })
  sheets.observe(document.head, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['media', 'disabled', 'href', 'rel'],
  })
  const holder = document.createElement('div')
  holder.setAttribute('aria-hidden', 'true')
  holder.setAttribute('data-text-style-probe', '')
  Object.assign(holder.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '0',
    height: '0',
    overflow: 'hidden',
    visibility: 'hidden',
    pointerEvents: 'none',
  })
  const probe = document.createElement('span')
  probe.textContent = PROBE_TEXT
  Object.assign(probe.style, { display: 'inline-block', width: 'max-content', whiteSpace: 'nowrap' })
  holder.append(probe)
  document.body.append(holder)
  const size = () => {
    const box = probe.getBoundingClientRect()
    return `${box.width}×${box.height}`
  }
  let measured = size()
  const resize = new ResizeObserver(() => {
    const next = size()
    if (next === measured) return
    measured = next
    notify()
  })
  resize.observe(probe)
  return () => {
    cancelAnimationFrame(frame)
    sheets.disconnect()
    resize.disconnect()
    holder.remove()
  }
}

/**
 * Avisa a `listener` (en el fotograma siguiente) cuando cambia el estilo del texto de la página sin que
 * cambie el ancho de ninguna caja: el espaciado de texto de WCAG 1.4.12 aplicado con la página ya cargada (un
 * marcador, una extensión), una hoja de estilo nueva. Lo usan los ajustes de texto (`useFitText`, el ajuste
 * común de las placas del menú y su segunda línea), que antes solo volvían a medir si cambiaba el ancho de su
 * caja o al llegar la fuente, y dejaban las etiquetas recortadas (jurado de la 0.28, ronda final, E1).
 * Devuelve la baja. Sin `ResizeObserver` (jsdom) no hace nada.
 */
export function onTextStyleChange(listener: () => void): () => void {
  if (typeof ResizeObserver === 'undefined' || typeof MutationObserver === 'undefined' || !document.body)
    return () => {}
  textStyleListeners.add(listener)
  stopWatchingTextStyle ??= watchTextStyle()
  return () => {
    textStyleListeners.delete(listener)
    if (textStyleListeners.size > 0) return
    stopWatchingTextStyle?.()
    stopWatchingTextStyle = null
  }
}

/**
 * Ajusta un texto en display a su ancho (guía §3.3, la banda del alias de la ficha de luchador y la
 * etiqueta de la opción de menú): baja la anchura de Anybody desde la del texto (`fromStretch`) hasta
 * `--bb-stretch-min` (105 %) y, si aún no cabe, el cuerpo hasta `minFontPx`. Si ni así cabe (una caja
 * muy estrecha), parte en líneas por palabras y, si es una sola palabra, baja hasta 12 px: antes eso
 * que cortarse. Mide en el *layout* y vuelve a medir
 * si cambia el ancho de su caja, su `state`, la fuente (al llegar) o el estilo del texto de la página
 * (`onTextStyleChange`: el espaciado de WCAG 1.4.12 aplicado con la página ya cargada cambia el ancho del
 * texto, no el de su caja). Sin `ResizeObserver` (jsdom) no hace nada: el texto se queda con su tamaño de
 * CSS.
 *
 * El texto tiene que poder desbordar en horizontal para medirse (`overflow-x: clip` o `hidden`), y no
 * recortar en vertical: las tildes de las mayúsculas en display (À, Ó, Ú) se salen por arriba de la
 * caja con el interlineado 0,9–1 (`overflow-y: visible`).
 */
export function useFitText<E extends HTMLElement>(
  ref: RefObject<E | null>,
  text: string,
  { fromStretch = '--bb-stretch-display', minFontPx = FIT_MIN_FONT_PX, state }: FitTextOptions = {},
): void {
  useLayoutEffect(() => {
    // `state` solo está para volver a ajustar cuando cambia (la placa elegida cambia su cuerpo de CSS).
    void state
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined' || !text) return
    const floor = Math.max(FLOOR_FONT_PX, minFontPx)
    const adjust = () => {
      element.style.fontStretch = ''
      element.style.fontSize = ''
      element.style.whiteSpace = ''
      const overflows = () => element.scrollWidth > element.clientWidth + 0.5
      if (!overflows()) return
      let stretch = stretchToken(fromStretch, 150)
      const min = stretchToken('--bb-stretch-min', 105)
      while (overflows() && stretch > min) {
        stretch = Math.max(min, stretch - STRETCH_STEP)
        element.style.fontStretch = `${stretch}%`
      }
      let size = Number.parseFloat(getComputedStyle(element).fontSize)
      while (overflows() && size > floor) {
        size = Math.max(floor, size - 1)
        element.style.fontSize = `${size}px`
      }
      if (!overflows()) return
      // Último recurso, en una caja muy estrecha: partir por palabras y, si es una sola palabra, bajar
      // hasta el mínimo legible. Antes eso que cortar el texto.
      element.style.whiteSpace = 'normal'
      while (overflows() && size > FLOOR_FONT_PX) {
        size -= 1
        element.style.fontSize = `${size}px`
      }
    }
    adjust()
    // Se observa la caja que manda en el ancho (la del padre), y solo cuenta si cambia su ancho: al
    // ajustar el texto cambia su alto, y volver a medir en el mismo fotograma sería un bucle de
    // `ResizeObserver` (que el navegador corta con un error). El ajuste va al fotograma siguiente.
    const box = element.parentElement ?? element
    let width = box.clientWidth
    let frame = 0
    const observer = new ResizeObserver(() => {
      if (box.clientWidth === width) return
      width = box.clientWidth
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(adjust)
    })
    observer.observe(box)
    // Con otro estilo de texto (el espaciado de 1.4.12 aplicado después de cargar), el texto mide otra cosa
    // en la misma caja: se vuelve a ajustar (ya en el fotograma siguiente al cambio).
    const offStyle = onTextStyleChange(adjust)
    // Con la fuente web ya cargada (llega con `swap`) el texto mide otra cosa: se vuelve a ajustar.
    let active = true
    void document.fonts?.ready.then(() => {
      if (active) adjust()
    })
    return () => {
      active = false
      cancelAnimationFrame(frame)
      observer.disconnect()
      offStyle()
    }
  }, [ref, text, fromStretch, minFontPx, state])
}
