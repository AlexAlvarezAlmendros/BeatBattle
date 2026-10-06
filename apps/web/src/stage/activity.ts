import { create } from 'zustand'

/**
 * Lo que se está moviendo en el Escenario (guía §4.7.5, tarea 1.3): un vinilo que gira, una ráfaga viva.
 * Mientras haya algo, el Escenario pinta a 60 fps como mucho; sin nada, solo bajo demanda.
 */
export const useStageActivity = create<{ animators: ReadonlySet<string> }>(() => ({ animators: new Set() }))

export function setAnimating(key: string, animating: boolean): void {
  useStageActivity.setState((state) => {
    if (state.animators.has(key) === animating) return state
    const animators = new Set(state.animators)
    if (animating) animators.add(key)
    else animators.delete(key)
    return { animators }
  })
}

/** Reloj del Escenario (s), el de `performance.now()`: el mismo origen que el giro de los vinilos del DOM. */
export const stageTime = () => performance.now() / 1000
