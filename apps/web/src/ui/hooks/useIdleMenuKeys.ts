import { type RefObject, useEffect } from 'react'
import { isIdleFocus } from './roving'
import type { RovingMenu } from './useRovingMenu'

export interface IdleMenuOptions {
  /** Las opciones del menú dentro de `listRef`, en su orden (por defecto, `[role="menuitem"]`). */
  itemSelector?: string
  /** Qué hace Intro con la opción elegida (por defecto, el clic: entra en ella). */
  activate?: (item: HTMLElement) => void
}

/**
 * Teclado de recreativa para un menú de pantalla (guía §3.8.3 y §3.8.14; `RD-VIS-02` d): con el foco en
 * ningún control (la página recién cargada, o el `<main>` al que va el foco al cambiar de pantalla), ↑/↓
 * mueven el cursor del menú en bucle, Inicio/Fin van a la primera y la última opción e Intro entra en
 * la elegida. Así el primer Tab sigue siendo «Saltar al contenido» y el menú no roba el foco al cargar.
 *
 * Ignora las teclas con modificadores, las repeticiones de Intro (la tecla mantenida entraba en la
 * opción y, en la pantalla nueva, en la suya, en bucle) y las que ya ha usado otra pieza
 * (`defaultPrevented`), no hace nada con una ventana de juego abierta encima (`isIdleFocus`): el menú
 * de detrás está tapado, y deja pasar la tecla si en `listRef` no hay ninguna opción (`itemSelector`),
 * para que la recoja otro menú de la pantalla.
 */
export function useIdleMenuKeys(
  menu: Pick<RovingMenu, 'activeIndex' | 'moveTo'>,
  count: number,
  listRef: RefObject<HTMLElement | null>,
  { itemSelector = '[role="menuitem"]', activate }: IdleMenuOptions = {},
): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      // Intro mantenida: solo cuenta la primera pulsación. Al entrar en una pantalla el foco va a su
      // `<main>` (reposo), y las repeticiones de la tecla accionaban también lo de la pantalla nueva.
      if (event.key === 'Enter' && event.repeat) return
      if (!isIdleFocus(document.activeElement)) return
      const step = { ArrowDown: 1, ArrowUp: -1 }[event.key]
      if (step === undefined && !['Home', 'End', 'Enter'].includes(event.key)) return
      const items = listRef.current?.querySelectorAll<HTMLElement>(itemSelector)
      if (!items?.length) return
      event.preventDefault()
      const current = menu.activeIndex
      if (event.key === 'Enter') {
        const item = items[current]
        if (item) (activate ?? ((element: HTMLElement) => element.click()))(item)
        return
      }
      const next =
        event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : (current + (step ?? 0) + count) % count
      menu.moveTo(next)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [count, menu, listRef, itemSelector, activate])
}
