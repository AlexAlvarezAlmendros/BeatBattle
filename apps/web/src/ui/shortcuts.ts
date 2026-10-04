import { create } from 'zustand'

/**
 * Atajos de una tecla (WCAG 2.1.4 «Atajos de teclado de un solo carácter», `RNF-A11Y-08`; guía §2.17 y
 * §3.3): **M** (sonido, en todas las pantallas), **Q/E** (secciones de Opciones y de los legales,
 * pestañas de la selección) y **B** (bases, en «Cómo se juega») actúan desde cualquier parte de la
 * pantalla. Quien dicta con control por voz fuera de un campo, o pulsa teclas sin querer, los apaga en
 * Opciones → Accesibilidad. Apagados:
 *
 * - Q/E y B solo actúan con el foco dentro de su grupo (las pestañas, la lista de movimientos): un atajo
 *   que solo funciona con su componente enfocado cumple 2.1.4.
 * - M no hace nada (queda el botón de sonido del HUD) y la barra de controles deja de enseñarla.
 *
 * Las flechas, Intro, Esc, Inicio y Fin no son atajos de un carácter y no cambian. La preferencia se
 * guarda en este navegador (`localStorage`); en el perfil, con las cuentas (Fase 2).
 */

/** Clave de `localStorage` de la preferencia. */
export const SHORTCUTS_STORAGE_KEY = 'bb:shortcuts'

function readStored(): boolean {
  try {
    return globalThis.localStorage?.getItem(SHORTCUTS_STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

function store(enabled: boolean): void {
  try {
    globalThis.localStorage?.setItem(SHORTCUTS_STORAGE_KEY, enabled ? 'on' : 'off')
  } catch {
    // Sin almacenamiento (ventana privada, bloqueado): la preferencia dura lo que la pestaña.
  }
}

interface ShortcutsState {
  /** Atajos de una tecla desde cualquier parte de la pantalla (por defecto, sí). */
  enabled: boolean
  toggle: () => void
  set: (enabled: boolean) => void
}

export const useShortcuts = create<ShortcutsState>((set) => ({
  enabled: readStored(),
  toggle: () =>
    set((state) => {
      store(!state.enabled)
      return { enabled: !state.enabled }
    }),
  set: (enabled) => {
    store(enabled)
    set({ enabled })
  },
}))

/**
 * ¿Puede actuar un atajo de una tecla? Siempre si el foco está dentro de su grupo (`inside`); desde
 * fuera, solo con los atajos encendidos.
 */
export function singleKeyAllowed(inside = false): boolean {
  return inside || useShortcuts.getState().enabled
}
