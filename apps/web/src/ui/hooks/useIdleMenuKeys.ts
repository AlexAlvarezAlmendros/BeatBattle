import { type RefObject, useEffect } from 'react'
import { isIdleFocus } from './roving'
import type { RovingMenu } from './useRovingMenu'

/**
 * Teclado de recreativa para un menú de pantalla (guía §3.8.3; `RD-VIS-02` d): con el foco en ningún
 * control (la página recién cargada, o el `<main>` al que va el foco al cambiar de pantalla), ↑/↓
 * mueven el cursor del menú en bucle, Inicio/Fin van a la primera y la última opción e Intro entra en
 * la elegida. Así el primer Tab sigue siendo «Saltar al contenido» y el menú no roba el foco al cargar.
 *
 * Ignora las teclas con modificadores y las que ya ha usado otra pieza (`defaultPrevented`), y no hace
 * nada con una ventana de juego abierta encima (`isIdleFocus`): el menú de detrás está tapado.
 */
export function useIdleMenuKeys(
  menu: Pick<RovingMenu, 'activeIndex' | 'moveTo'>,
  count: number,
  listRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      if (!isIdleFocus(document.activeElement)) return
      const step = { ArrowDown: 1, ArrowUp: -1 }[event.key]
      if (step === undefined && !['Home', 'End', 'Enter'].includes(event.key)) return
      event.preventDefault()
      const current = menu.activeIndex
      if (event.key === 'Enter') {
        listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')[current]?.click()
        return
      }
      const next =
        event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : (current + (step ?? 0) + count) % count
      menu.moveTo(next)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [count, menu, listRef])
}
