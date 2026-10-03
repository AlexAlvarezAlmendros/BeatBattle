import { type RefObject, useLayoutEffect } from 'react'

/** Paso de la anchura al encoger, en puntos porcentuales. */
const STRETCH_STEP = 5
/** Cuerpo mínimo del alias, en px (§3.3 «Ficha de luchador»: «después el cuerpo hasta 30 px»). */
export const FIT_MIN_FONT_PX = 30

/** Valor numérico de un token de anchura (`--bb-stretch-display` → 150), leído del CSS. */
function stretchToken(name: string, fallback: number): number {
  const value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name))
  return Number.isFinite(value) ? value : fallback
}

/**
 * Ajusta un texto en display a su ancho (guía §3.3, la banda del alias de la ficha de luchador): baja
 * la anchura de Anybody de `--bb-stretch-display` (150 %) a `--bb-stretch-min` (105 %) y, si aún no
 * cabe, el cuerpo hasta 30 px. Mide en el *layout* y vuelve a medir si cambia el ancho de su caja. Sin
 * `ResizeObserver` (jsdom) no hace nada: el texto se queda con su tamaño de CSS.
 */
export function useFitText<E extends HTMLElement>(ref: RefObject<E | null>, text: string): void {
  useLayoutEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined' || !text) return
    const adjust = () => {
      element.style.fontStretch = ''
      element.style.fontSize = ''
      const overflows = () => element.scrollWidth > element.clientWidth + 0.5
      let stretch = stretchToken('--bb-stretch-display', 150)
      const min = stretchToken('--bb-stretch-min', 105)
      while (overflows() && stretch > min) {
        stretch = Math.max(min, stretch - STRETCH_STEP)
        element.style.fontStretch = `${stretch}%`
      }
      let size = Number.parseFloat(getComputedStyle(element).fontSize)
      while (overflows() && size > FIT_MIN_FONT_PX) {
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
  }, [ref, text])
}
