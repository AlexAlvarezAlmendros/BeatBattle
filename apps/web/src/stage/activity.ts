import { create } from 'zustand'

/**
 * Lo que se está moviendo en el Escenario (guía §4.7.5, tareas 1.3 y 1.6) y a cuántos fps como mucho: la
 * trama que reacciona al audio, a 30; un vinilo que gira o una ráfaga viva, a 60. Mientras haya algo, el
 * Escenario pinta al ritmo del más exigente; sin nada, solo bajo demanda.
 */
export const useStageActivity = create<{ animators: ReadonlyMap<string, number> }>(() => ({
  animators: new Map(),
}))

export function setAnimating(key: string, animating: boolean, fps = 60): void {
  useStageActivity.setState((state) => {
    if (animating ? state.animators.get(key) === fps : !state.animators.has(key)) return state
    const animators = new Map(state.animators)
    if (animating) animators.set(key, fps)
    else animators.delete(key)
    return { animators }
  })
}

/** Los fps que hacen falta ahora: los del animador más exigente (0 si no se mueve nada). */
export function neededFps(animators: ReadonlyMap<string, number>): number {
  let most = 0
  for (const fps of animators.values()) most = Math.max(most, fps)
  return most
}

/** Reloj del Escenario (s), el de `performance.now()`: el mismo origen que el giro de los vinilos del DOM. */
export const stageTime = () => performance.now() / 1000
