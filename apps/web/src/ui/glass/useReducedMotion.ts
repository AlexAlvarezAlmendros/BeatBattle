import { useSyncExternalStore } from 'react'

/**
 * «Reducir movimiento» (guía §2.17 `RNF-A11Y-03` y `RNF-A11Y-08`, Anexo E): vale tanto la preferencia
 * del sistema (`prefers-reduced-motion: reduce`) como el ajuste propio de la app
 * (`<html data-motion="reduced">`). Son las mismas dos condiciones que usan `tokens.css` y
 * `global.css`, para que el CSS y Motion nunca discrepen.
 *
 * `useReducedMotion` de Motion solo mira la del sistema: por eso las piezas usan este.
 */

const QUERY = '(prefers-reduced-motion: reduce)'

/** ¿Está activo «reducir movimiento» ahora mismo? Sin `window` (o sin `matchMedia`), solo el ajuste. */
export function prefersReducedMotion(): boolean {
  if (typeof document === 'undefined') return false
  if (document.documentElement.dataset.motion === 'reduced') return true
  return typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches
}

function subscribe(onChange: () => void): () => void {
  if (typeof document === 'undefined') return () => {}
  const media = typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : undefined
  media?.addEventListener('change', onChange)
  // El ajuste de la app cambia el atributo de <html> en caliente (Ajustes → Sonido y efectos).
  const observer = typeof MutationObserver === 'undefined' ? undefined : new MutationObserver(onChange)
  observer?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] })
  return () => {
    media?.removeEventListener('change', onChange)
    observer?.disconnect()
  }
}

/** Hook: `true` con «reducir movimiento» (sistema o ajuste de la app); se actualiza en caliente. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false)
}
