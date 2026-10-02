import { useCallback, useSyncExternalStore } from 'react'

/**
 * Consulta de medios como estado de React: `true` mientras `query` se cumple, y se actualiza al
 * cambiar (girar el móvil, cambiar la preferencia del sistema).
 *
 * Sin `matchMedia` (jsdom, render en servidor) devuelve `false`: ninguna pieza debe depender de
 * esto para funcionar, solo para decidir cuánto adorno pone.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = getMediaQueryList(query)
      list?.addEventListener('change', onChange)
      return () => list?.removeEventListener('change', onChange)
    },
    [query],
  )
  const getSnapshot = useCallback(() => matchesMedia(query), [query])
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

/** ¿Se cumple la consulta ahora mismo? `false` si el entorno no tiene `matchMedia`. */
export function matchesMedia(query: string): boolean {
  return getMediaQueryList(query)?.matches ?? false
}

function getMediaQueryList(query: string): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  return window.matchMedia(query)
}

/**
 * Puntero grueso o sin hover (móviles y tabletas): ni inclinación 3D ni efectos que siguen al
 * cursor, y objetivos táctiles de 44 px (RNF-A11Y-09).
 */
export const COARSE_POINTER_QUERY = '(hover: none), (pointer: coarse)'
