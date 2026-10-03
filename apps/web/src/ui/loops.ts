import { create } from 'zustand'

/**
 * Pausa de los bucles decorativos (WCAG 2.2.2 «Pausar, detener, ocultar», nivel A; guía §3.6 «Bucles» y
 * §3.8.3): el vinilo-sol, el respiro de «Inserta tu beat», el latido del reloj de ronda en la última
 * hora y la rotación de la crónica arrancan solos y no acaban nunca. El botón de pausa de la barra de
 * controles los para todos a la vez, sin depender de «reducir movimiento» (que además los quita).
 *
 * La pausa se marca en `<html data-loops="paused">` para que el CSS pare sus bucles; el vinilo (Web
 * Animations) y la crónica (un temporizador) leen el estado de aquí. Dura lo que la pestaña: es un
 * control de la página, no una preferencia (esa es «reducir movimiento», RNF-A11Y-08).
 */

/** Atributo de `<html>` con la pausa y su valor. */
export const LOOPS_ATTRIBUTE = 'data-loops'
export const LOOPS_PAUSED = 'paused'

function mark(paused: boolean): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (paused) root.setAttribute(LOOPS_ATTRIBUTE, LOOPS_PAUSED)
  else root.removeAttribute(LOOPS_ATTRIBUTE)
}

interface LoopsState {
  /** Bucles decorativos parados con el botón de pausa (por defecto, no). */
  paused: boolean
  toggle: () => void
  set: (paused: boolean) => void
}

export const useLoops = create<LoopsState>((set) => ({
  paused: false,
  toggle: () =>
    set((state) => {
      mark(!state.paused)
      return { paused: !state.paused }
    }),
  set: (paused) => {
    mark(paused)
    set({ paused })
  },
}))
