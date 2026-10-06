import { create } from 'zustand'

/**
 * Calidad del Escenario (guía §3.5 «Calidad» y «Sonda», tarea 1.2). Módulo ligero, fuera del trozo del
 * Escenario: la arena necesita saber si encender el lienzo antes de descargarlo.
 *
 * - **Alta**: todo, la trama al dpr del dispositivo (hasta 2).
 * - **Media**: la trama a dpr 1.
 * - **Baja**: la arena estática (el 3D, solo en las ceremonias).
 * - **Apagada**: sin WebGL.
 *
 * La decide la sonda de 2 s (una vez por sesión) salvo que se haya elegido a mano (`bb:quality`).
 */

export const QUALITIES = ['alta', 'media', 'baja', 'apagada'] as const
export type Quality = (typeof QUALITIES)[number]

/** Calidad elegida a mano (Opciones; hasta que existan, `localStorage`). */
export const QUALITY_KEY = 'bb:quality'
/** Resultado de la sonda en esta sesión. */
export const PROBE_KEY = 'bb:stage-probe'

/** Duración de la sonda (ms de pestaña visible). */
export const PROBE_MS = 2000

/** Umbrales de la sonda (mediana de fps, §3.5). */
export function qualityFromFps(fps: number): Quality {
  if (fps >= 50) return 'alta'
  if (fps >= 35) return 'media'
  if (fps >= 20) return 'baja'
  return 'apagada'
}

/** Mediana de los intervalos entre fotogramas (s) → fps. Sin intervalos, 0. */
export function medianFps(deltas: readonly number[]): number {
  const valid = deltas.filter((d) => Number.isFinite(d) && d > 0).sort((a, b) => a - b)
  if (valid.length === 0) return 0
  const middle = valid.length >> 1
  const median =
    valid.length % 2
      ? (valid[middle] as number)
      : ((valid[middle - 1] as number) + (valid[middle] as number)) / 2
  return 1 / median
}

const isQuality = (value: unknown): value is Quality => QUALITIES.includes(value as Quality)

function read(storage: () => Storage, key: string): Quality | null {
  try {
    const value = storage().getItem(key)
    return isQuality(value) ? value : null
  } catch {
    return null
  }
}

export const readManualQuality = () => read(() => window.localStorage, QUALITY_KEY)
export const readProbedQuality = () => read(() => window.sessionStorage, PROBE_KEY)

/** ¿Pinta el Escenario la arena con esta calidad? Sin calidad todavía (la sonda va a medir), sí. */
export const arenaUsesStage = (quality: Quality | null) =>
  quality === null || quality === 'alta' || quality === 'media'

/** dpr del lienzo: alta, el del dispositivo entre 1 y 2; media, 1. */
export function stageDpr(quality: Quality | null): number | [number, number] {
  return quality === 'media' ? 1 : [1, 2]
}

interface StageQualityState {
  /** La calidad en vigor: la elegida a mano, la de la sonda o, si aún no hay sonda, `null`. */
  quality: Quality | null
  source: 'manual' | 'probe' | null
  /** Resultado de la sonda (se guarda para la sesión). */
  setProbed: (quality: Quality) => void
}

function initial(): Pick<StageQualityState, 'quality' | 'source'> {
  if (typeof window === 'undefined') return { quality: null, source: null }
  const manual = readManualQuality()
  if (manual) return { quality: manual, source: 'manual' }
  const probed = readProbedQuality()
  return probed ? { quality: probed, source: 'probe' } : { quality: null, source: null }
}

export const useStageQuality = create<StageQualityState>((set, get) => ({
  ...initial(),
  setProbed: (quality) => {
    if (get().source === 'manual') return
    try {
      window.sessionStorage.setItem(PROBE_KEY, quality)
    } catch {
      // Sin almacenamiento: la sonda se repetirá en la próxima carga.
    }
    set({ quality, source: 'probe' })
  },
}))
