import { type RefObject, useLayoutEffect, useState } from 'react'

/**
 * Ancho en píxeles CSS del elemento de `ref`, actualizado con `ResizeObserver`. Devuelve `0` hasta
 * medirlo, y también donde no hay maquetación (jsdom): quien lo usa necesita un valor por defecto.
 */
export function useElementWidth(ref: RefObject<Element | null>): number {
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    setWidth(element.getBoundingClientRect().width)
    if (typeof ResizeObserver !== 'function') return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  return width
}
