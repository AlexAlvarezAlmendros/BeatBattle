import { type RefObject, useEffect, useState } from 'react'
import { create } from 'zustand'
import { type FlashGrant, type FlashReason, flash } from '../ui/flash/flash'
import type { CardFront } from '../ui/ProducerCard/cardModel'
import type { CardSide } from '../ui/ProducerCard/ProducerCard'

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

/** Lo que dice la carta del pase: el anverso de `cardModel` (el mismo de la plana), su foto y su reverso. */
export interface PassFace {
  front: CardFront
  /** Foto del avatar; sin ella, el monograma. */
  avatarUrl: string | null
  /** La dirección del perfil y su QR (el PNG del servidor), como el `back` de `ProducerCard`. */
  back: { profileUrl: string; qrSrc: string }
}

/**
 * La carta de productor colgada de su pase de torneo (§3.4.4, §3.5 capa 1; tarea 7.23): la vista la pinta el
 * Escenario con su física (Rapier) en un trozo propio que solo se pide cuando una pantalla registra el pase (el
 * perfil). Mientras no pinta, se ve la carta plana (`ProducerCard`), que es también la de `RF-GAME-07`.
 */
export interface StagePass {
  id: number
  /** La caja de la vista (drei `View`): el hueco del pase encima de la carta y su margen para moverse. */
  element: HTMLElement
  /** La carta plana: su caja sin el giro (`offset*`) es donde descansa la 3D. */
  card: HTMLElement
  /** Lo que dice la carta (el mismo modelo que la plana, `cardModel`). */
  face: PassFace
  /** Cara que se ve (la tecla C del perfil). */
  side: CardSide
}

interface StageRuntime {
  /** El Escenario está montado y pinta: sin él, ni vistas ni ráfagas. */
  running: boolean
  anchors: StageAnchor[]
  /** La carta con su pase, si una pantalla la ha pedido (solo una a la vez). */
  pass: StagePass | null
  /** Vistas que ya han pintado su primer fotograma (la pieza DOM de respaldo ya se puede esconder). */
  live: ReadonlySet<number>
  bursts: StageBurst[]
}

export const useStageRuntime = create<StageRuntime>(() => ({
  running: false,
  anchors: [],
  pass: null,
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
 * Registra la carta con su pase mientras `enabled` (y el componente esté montado) y devuelve si ya la pinta el
 * Escenario: hasta entonces se ve la carta plana. `view` es la caja de la vista; `card`, la carta plana, que marca
 * dónde descansa la 3D. La cara y lo que dice se actualizan sin volver a registrar la vista.
 */
export function useStagePass(
  view: RefObject<HTMLElement | null>,
  card: RefObject<HTMLElement | null>,
  face: PassFace,
  side: CardSide,
  enabled: boolean,
): boolean {
  const [id] = useState(() => nextId++)
  const faceKey = JSON.stringify(face)
  // biome-ignore lint/correctness/useExhaustiveDependencies: la cara la pone el efecto de abajo
  useEffect(() => {
    const element = view.current
    const cardElement = card.current
    if (!enabled || !element || !cardElement) return
    useStageRuntime.setState({ pass: { id, element, card: cardElement, face, side } })
    return () => {
      useStageRuntime.setState((state) => (state.pass?.id === id ? { pass: null } : state))
      setViewLive(id, false)
    }
  }, [id, view, card, enabled])
  // biome-ignore lint/correctness/useExhaustiveDependencies: `faceKey` resume `face`
  useEffect(() => {
    useStageRuntime.setState((state) =>
      state.pass?.id === id ? { pass: { ...state.pass, face, side } } : state,
    )
  }, [id, faceKey, side])
  return useStageRuntime((state) => enabled && state.running && state.pass?.id === id && state.live.has(id))
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
