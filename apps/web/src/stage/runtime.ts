import { type RefObject, useEffect, useState } from 'react'
import { create } from 'zustand'
import { type FlashGrant, type FlashReason, flash } from '../ui/flash/flash'

/**
 * Lo que el DOM le pide al Escenario (guía §3.5 capas 1 y 2, tarea 1.3): las **vistas ancladas** y las
 * **ráfagas de partículas**. Módulo ligero, fuera del trozo del Escenario: una pantalla registra su vista
 * o pide una ráfaga sin descargar three; el Escenario, cuando está, lo lee de aquí.
 *
 * Las vistas van donde la arena está a la vista: el lienzo es único y va detrás del contenido, y sobre él
 * siguen los rayos y la viñeta de la arena. Dentro de un panel opaco (el vinilo de la tarjeta del
 * escenario) la pieza es DOM.
 */

/** El vinilo-sol de la semana (§3.5 capa 1): lo mismo que pinta `VinylSun`. */
export interface VinylViewProps {
  label: string
  sub: string
  bpm: number
}

export interface StageAnchor {
  id: number
  kind: 'vinyl'
  /** El elemento al que va pegada la vista: marca su sitio y su tamaño. */
  element: HTMLElement
  props: VinylViewProps
}

/** Ráfagas de §3.5 capa 2: chispas rojas y blancas (voto de 5, VS) y confeti en la paleta (ceremonias). */
export type BurstKind = 'sparks' | 'confetti'

export interface BurstRequest {
  kind: BurstKind
  /** Centro de la ráfaga en px CSS de la ventana. */
  x: number
  y: number
  reason: FlashReason
  /** Partículas que pide con la calidad alta (se escala con el presupuesto de la calidad). */
  count?: number
  /** Área de la ventana que quiere ocupar (0–1; el limitador la recorta al 25 %). */
  area?: number
}

/** Ráfaga autorizada, en la cola del Escenario. */
export interface StageBurst extends BurstRequest {
  grant: FlashGrant
}

interface StageRuntime {
  /** El Escenario está montado y pinta: sin él, ni vistas ni ráfagas. */
  running: boolean
  anchors: StageAnchor[]
  /** Vistas que ya han pintado su primer fotograma (la pieza DOM de respaldo ya se puede esconder). */
  live: ReadonlySet<number>
  bursts: StageBurst[]
}

export const useStageRuntime = create<StageRuntime>(() => ({
  running: false,
  anchors: [],
  live: new Set(),
  bursts: [],
}))

let nextId = 1

/** El Escenario se monta o se desmonta (lo llama él). Al irse, las vistas vuelven al DOM. */
export function setStageRunning(running: boolean): void {
  useStageRuntime.setState((state) => ({
    running,
    live: running ? state.live : new Set(),
    bursts: running ? state.bursts : [],
  }))
}

/** La vista `id` ya ha pintado (o deja de hacerlo). */
export function setViewLive(id: number, live: boolean): void {
  useStageRuntime.setState((state) => {
    if (state.live.has(id) === live) return state
    const next = new Set(state.live)
    if (live) next.add(id)
    else next.delete(id)
    return { live: next }
  })
}

/**
 * Registra una vista anclada a `ref` mientras el componente esté montado y devuelve si ya la pinta el
 * Escenario: hasta entonces se ve la pieza DOM (el relevo no deja hueco, como el de la trama).
 */
export function useStageView(ref: RefObject<HTMLElement | null>, props: VinylViewProps): boolean {
  const [id] = useState(() => nextId++)
  const { label, sub, bpm } = props
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const anchor: StageAnchor = { id, kind: 'vinyl', element, props: { label, sub, bpm } }
    useStageRuntime.setState((state) => ({
      anchors: [...state.anchors.filter((other) => other.id !== id), anchor],
    }))
    return () => {
      useStageRuntime.setState((state) => ({ anchors: state.anchors.filter((other) => other.id !== id) }))
      setViewLive(id, false)
    }
  }, [id, ref, label, sub, bpm])
  return useStageRuntime((state) => state.running && state.live.has(id))
}

/**
 * Pide una ráfaga de partículas. Pasa **siempre** por el limitador de destellos (`RD-MOT-04`): sin su
 * permiso (más de 3 por segundo, modo serio) no hay ráfaga, y la que hay ocupa como mucho el área y la
 * opacidad que autoriza. Sin Escenario no pide permiso (no gasta un destello que nadie va a pintar).
 * Devuelve lo autorizado o `null`.
 */
export function stageBurst(request: BurstRequest): FlashGrant | null {
  if (!useStageRuntime.getState().running) return null
  const grant = flash.request({ reason: request.reason, area: request.area ?? 0.12, opacity: 1 })
  if (!grant) return null
  useStageRuntime.setState((state) => ({ bursts: [...state.bursts, { ...request, grant }] }))
  return grant
}

/** El Escenario recoge las ráfagas pendientes (y vacía la cola). */
export function takeBursts(): StageBurst[] {
  const { bursts } = useStageRuntime.getState()
  if (bursts.length === 0) return bursts
  useStageRuntime.setState({ bursts: [] })
  return bursts
}
