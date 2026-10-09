import { type RefObject, useEffect } from 'react'
import { isIdleFocus } from './roving'

const FIELD = 'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])'

/**
 * El teclado de recreativa en una pantalla de formulario (guía §3.8.14, `RD-VIS-02` d; tarea 2.15): el
 * primer elemento de juego es el **primer campo**. Con el foco en ningún control (la página recién abierta,
 * o el `<main>` al que va el foco al cambiar de pantalla), ↑, ↓ e Intro lo enfocan, sin enviar nada: así
 * dos Intro seguidas desde el menú no mandan el formulario, y el primer Tab sigue siendo «Saltar al
 * contenido». Ignora las repeticiones de Intro, las teclas con modificadores y las ya usadas por otra pieza.
 */
export function useIdleFormKeys(scopeRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      if (event.key === 'Enter' && event.repeat) return
      if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return
      if (!isIdleFocus(document.activeElement)) return
      const field = scopeRef.current?.querySelector<HTMLElement>(FIELD)
      if (!field) return
      event.preventDefault()
      field.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [scopeRef])
}
