import { useSyncExternalStore } from 'react'

/**
 * Modo serio (guía §2.11, §3.6, RNF-A11Y-08): quita anunciador, estampas, rayos, líneas de barrido,
 * temblores y partículas, y deja paneles, texto y la trama fija. Se pierde espectáculo, nunca
 * información. Se marca con `<html data-serious>`: el CSS lo lee (`global.css` oculta lo que lleva
 * `data-fx` y `tokens.css` pone `--bb-fx` a 0) y este hook se lo da a las piezas animadas por
 * JavaScript (Escenario, anunciador, partículas, `flash.request()`).
 *
 * Solo el atributo, como «reducir movimiento»: guardarlo en `localStorage` y en el perfil es cosa de
 * los ajustes (Opciones, RNF-A11Y-08).
 */
export function useSeriousMode(): boolean {
  return useSyncExternalStore(subscribeSeriousMode, isSeriousMode, () => false)
}

/** Atributo de `<html>` del modo serio. */
export const SERIOUS_ATTRIBUTE = 'data-serious'

/** ¿Está el modo serio? Para código fuera de React. */
export function isSeriousMode(): boolean {
  if (typeof document === 'undefined') return false
  return document.documentElement.hasAttribute(SERIOUS_ATTRIBUTE)
}

/** Activa o quita el modo serio en `<html>`. */
export function setSeriousMode(serious: boolean): void {
  if (serious) document.documentElement.setAttribute(SERIOUS_ATTRIBUTE, '')
  else document.documentElement.removeAttribute(SERIOUS_ATTRIBUTE)
}

const listeners = new Set<() => void>()
let observer: MutationObserver | null = null

/** Avisa a `onChange` cuando cambia el atributo (un único observador para todas las instancias). */
export function subscribeSeriousMode(onChange: () => void): () => void {
  listeners.add(onChange)
  if (listeners.size === 1 && typeof MutationObserver === 'function') {
    observer = new MutationObserver(() => {
      for (const listener of [...listeners]) listener()
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: [SERIOUS_ATTRIBUTE] })
  }
  return () => {
    listeners.delete(onChange)
    if (listeners.size > 0) return
    observer?.disconnect()
    observer = null
  }
}
