import { useEffect } from 'react'
import { audio } from '../../audio/engine'
import { useSound } from './soundStore'

/** Gestos que cuentan como primera interacción (la política de *autoplay* de los navegadores). */
const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchend'] as const

/**
 * Puerta mínima del audio (guía §3.7.1, tarea 1.4; la completa, con «PULSA PARA EMPEZAR», es la 1.13): el
 * `AudioContext` se crea en el primer gesto del usuario y nunca antes (`RD-SND-01`). Además, lleva al motor
 * el silencio del HUD (tecla M, `useSound`).
 */
export function useAudioUnlock(): void {
  const enabled = useSound((state) => state.enabled)

  useEffect(() => {
    audio.setMuted(!enabled)
  }, [enabled])

  useEffect(() => {
    const unlock = () => {
      audio.unlock()
      remove()
    }
    const remove = () => {
      for (const type of UNLOCK_EVENTS) window.removeEventListener(type, unlock, { capture: true })
    }
    for (const type of UNLOCK_EVENTS) window.addEventListener(type, unlock, { capture: true, passive: true })
    return remove
  }, [])
}
