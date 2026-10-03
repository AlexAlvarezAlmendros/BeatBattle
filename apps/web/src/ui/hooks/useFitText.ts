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

/**
 * Ajusta un texto en display a su ancho (guía §3.3, la banda del alias de la ficha de luchador y la
 * etiqueta de la opción de menú): baja la anchura de Anybody desde la del texto (`fromStretch`) hasta
 * `--bb-stretch-min` (105 %) y, si aún no cabe, el cuerpo hasta `minFontPx`. Si ni así cabe (una caja
 * muy estrecha), parte en líneas por palabras y, si es una sola palabra, baja hasta 12 px: antes eso
 * que cortarse. Mide en el *layout* y vuelve a medir
 * si cambia el ancho de su caja o su `state`. Sin `ResizeObserver` (jsdom) no hace nada: el texto se
 * queda con su tamaño de CSS.
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
    // Con la fuente web ya cargada (llega con `swap`) el texto mide otra cosa: se vuelve a ajustar.
    let active = true
    void document.fonts?.ready.then(() => {
      if (active) adjust()
    })
    return () => {
      active = false
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [ref, text, fromStretch, minFontPx, state])
}
