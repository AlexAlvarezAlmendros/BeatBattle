import { useSyncExternalStore } from 'react'
import { matchesMedia } from './useMediaQuery'

/**
 * «Reducir movimiento» (RNF-A11Y-03, RNF-A11Y-08): `true` si lo pide el sistema
 * (`prefers-reduced-motion: reduce`) **o** el ajuste propio de la app (`<html data-motion="reduced">`).
 *
 * Es el mismo criterio que usan `tokens.css` y `global.css` para el CSS; este hook lo da a las piezas
 * animadas con Motion o con JavaScript, que no ven las variables CSS. No se usa el
 * `useReducedMotion` de Motion porque solo mira la preferencia del sistema.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, isReducedMotion, () => false)
}

/** Consulta de medios de la preferencia del sistema. */
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/** Atributo de `<html>` con el ajuste propio de la app, y su valor. */
export const MOTION_ATTRIBUTE = 'data-motion'
export const MOTION_REDUCED = 'reduced'

/** ¿Hay que reducir el movimiento ahora mismo? Para código fuera de React (Escenario, efectos). */
export function isReducedMotion(): boolean {
  if (typeof document === 'undefined') return false
  return (
    document.documentElement.getAttribute(MOTION_ATTRIBUTE) === MOTION_REDUCED ||
    matchesMedia(REDUCED_MOTION_QUERY)
  )
}

/**
 * Activa o quita el ajuste propio de «reducir movimiento» en `<html>`. Solo el atributo: guardarlo en
 * `localStorage` y en el perfil es cosa de los ajustes (RNF-A11Y-08, Fase 1).
 */
export function setReducedMotion(reduced: boolean): void {
  const root = document.documentElement
  if (reduced) root.setAttribute(MOTION_ATTRIBUTE, MOTION_REDUCED)
  else root.removeAttribute(MOTION_ATTRIBUTE)
}

/** ¿Está puesto el ajuste propio (sin contar la preferencia del sistema)? */
export function hasReducedMotionSetting(): boolean {
  return document.documentElement.getAttribute(MOTION_ATTRIBUTE) === MOTION_REDUCED
}

function subscribe(onChange: () => void): () => void {
  const list =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(REDUCED_MOTION_QUERY)
      : null
  list?.addEventListener('change', onChange)
  const observer = typeof MutationObserver === 'function' ? new MutationObserver(onChange) : null
  observer?.observe(document.documentElement, { attributes: true, attributeFilter: [MOTION_ATTRIBUTE] })
  return () => {
    list?.removeEventListener('change', onChange)
    observer?.disconnect()
  }
}
