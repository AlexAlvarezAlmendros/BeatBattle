import { create } from 'zustand'

/**
 * La ceremonia de resultados en el Escenario (guía §3.8.6, §3.5 capa 1; tarea 6.17b): lo que la capa de la
 * ceremonia (DOM) le dice a la vista 3D. Módulo ligero, fuera del trozo del Escenario (sin three): la ceremonia
 * marca los pasos de su línea de tiempo y el Escenario los anima; de vuelta, la vista dice dónde cae cada
 * puesto en la pantalla (para colocar sus nombres, que siguen siendo texto del DOM) y cuándo ha pintado.
 */

/** Portada de un puesto: la generativa (semilla, BPM y tonalidad) o la imagen propia. */
export type CeremonyCover =
  | { kind: 'generative'; seed: number | string; bpm: number | null; musicalKey: string | null }
  | { kind: 'own'; url: string }

/** Paso de un puesto en la línea de tiempo: fuera, foco (la medalla baja), sello arrancado, nombre revelado. */
export type CeremonyStep = 'hidden' | 'spot' | 'tear' | 'name'

export interface CeremonyPlace {
  place: 1 | 2 | 3
  cover: CeremonyCover
  step: CeremonyStep
  /** Cuándo llegó a su paso (`performance.now()`): el Escenario anima desde ahí. */
  at: number
}

/** Dónde cae un puesto en la pantalla (px CSS de la ventana): el pie de su peana. */
export interface ProjectedPlace {
  x: number
  y: number
}

interface CeremonyStage {
  /** El elemento de la capa al que va pegada la vista (toda la pantalla); `null` sin ceremonia. */
  element: HTMLElement | null
  places: CeremonyPlace[]
  /** «¡CAMPEÓN!»: la corona sobre el 1.º. */
  championAt: number | null
  /** Tiempos internos de la línea de tiempo (ms), los de `CEREMONY_TIMELINE`. */
  tearMs: number
  /** La vista ya ha pintado: la capa puede quitar su respaldo 2D. */
  live: boolean
  /** Pies de las peanas proyectados, por puesto. */
  projected: Partial<Record<1 | 2 | 3, ProjectedPlace>>
}

const EMPTY: CeremonyStage = {
  element: null,
  places: [],
  championAt: null,
  tearMs: 600,
  live: false,
  projected: {},
}

export const useCeremonyStage = create<CeremonyStage>(() => EMPTY)

/** Empieza la ceremonia en el Escenario, anclada a `element`. */
export function startCeremonyStage(
  element: HTMLElement,
  places: Omit<CeremonyPlace, 'step' | 'at'>[],
  tearMs: number,
) {
  useCeremonyStage.setState({
    ...EMPTY,
    element,
    tearMs,
    places: places.map((place) => ({ ...place, step: 'hidden', at: 0 })),
  })
}

/** Un puesto pasa a `step`. */
export function setCeremonyStep(place: 1 | 2 | 3, step: CeremonyStep) {
  const at = performance.now()
  useCeremonyStage.setState((state) => ({
    places: state.places.map((item) => (item.place === place ? { ...item, step, at } : item)),
  }))
}

export function setCeremonyChampion() {
  useCeremonyStage.setState({ championAt: performance.now() })
}

/** Se acaba (o se salta): la vista se va. */
export function endCeremonyStage() {
  useCeremonyStage.setState(EMPTY)
}

/** La vista ha pintado su primer fotograma (o deja de pintar). */
export function setCeremonyLive(live: boolean) {
  if (useCeremonyStage.getState().live !== live) useCeremonyStage.setState({ live })
}

/** La vista publica dónde cae cada peana (solo si se ha movido más de medio píxel: sin renders de sobra). */
export function setCeremonyProjected(place: 1 | 2 | 3, point: ProjectedPlace) {
  const previous = useCeremonyStage.getState().projected[place]
  if (previous && Math.abs(previous.x - point.x) < 0.5 && Math.abs(previous.y - point.y) < 0.5) return
  useCeremonyStage.setState((state) => ({ projected: { ...state.projected, [place]: point } }))
}
