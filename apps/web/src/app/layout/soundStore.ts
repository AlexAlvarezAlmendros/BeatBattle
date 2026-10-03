import { create } from 'zustand'

/**
 * Interruptor del sonido de efectos (guía §3.4.1 «botón de sonido», §3.7, `RD-SND-06`): lo cambian el
 * botón del HUD y la tecla M en cualquier pantalla. El motor de audio llega con la Fase 1; hasta
 * entonces el interruptor ya guarda la preferencia (en este navegador) para que el botón diga la
 * verdad cuando haya sonido. Ningún sonido suena antes de la primera interacción (`RD-SND-01`): esto
 * solo guarda si el usuario lo quiere.
 */

/** Clave de `localStorage` de la preferencia. */
export const SOUND_STORAGE_KEY = 'bb:sound'

function readStored(): boolean {
  try {
    return globalThis.localStorage?.getItem(SOUND_STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

function store(enabled: boolean): void {
  try {
    globalThis.localStorage?.setItem(SOUND_STORAGE_KEY, enabled ? 'on' : 'off')
  } catch {
    // Sin almacenamiento (ventana privada, bloqueado): la preferencia dura lo que la pestaña.
  }
}

interface SoundState {
  /** Efectos encendidos (por defecto, sí: suenan tras la primera interacción). */
  enabled: boolean
  toggle: () => void
  set: (enabled: boolean) => void
}

export const useSound = create<SoundState>((set) => ({
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
