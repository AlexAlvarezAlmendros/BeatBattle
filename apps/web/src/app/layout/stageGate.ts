import { useSyncExternalStore } from 'react'
import { useReducedMotion } from '../../ui/hooks/useReducedMotion'

/**
 * ¿Se carga el Escenario de WebGL o se queda la arena estática (calidad «Apagada», guía §3.5)? Tarea 1.1:
 * la sonda de rendimiento y los niveles de calidad son de la 1.2; aquí solo lo que ya obliga la guía:
 * sin WebGL, con «reducir movimiento» (`RNF-A11Y-03`) o con ahorro de datos, la arena estática.
 *
 * `localStorage['bb:stage']` lo fuerza para pruebas y depuración: `off` siempre la estática; `on`, el
 * Escenario también con «reducir movimiento» (si hay WebGL).
 */
export const STAGE_OVERRIDE_KEY = 'bb:stage'

export type StageOverride = 'on' | 'off' | null

export function readStageOverride(): StageOverride {
  try {
    const value = window.localStorage.getItem(STAGE_OVERRIDE_KEY)
    return value === 'on' || value === 'off' ? value : null
  } catch {
    return null
  }
}

interface NetworkInformationLike {
  saveData?: boolean
}

/** ¿Ha pedido el navegador ahorrar datos? */
export function prefersSaveData(): boolean {
  if (typeof navigator === 'undefined') return false
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection
  return connection?.saveData === true
}

let webgl: boolean | null = null

/**
 * ¿Hay WebGL? Se mira una vez, y solo cuando ya se va a cargar el Escenario (crear un contexto cuesta):
 * nunca antes de la primera pintura.
 */
export function hasWebGL(): boolean {
  if (webgl !== null) return webgl
  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    webgl = context !== null
    context?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    webgl = false
  }
  return webgl
}

const noop = () => () => {}

/** ¿Puede ir el Escenario? (Sin mirar WebGL, que se comprueba al cargar.) */
export function stageAllowed(override: StageOverride, reducedMotion: boolean, saveData: boolean): boolean {
  if (override === 'off') return false
  if (override === 'on') return true
  return !reducedMotion && !saveData
}

export function useStageAllowed(): boolean {
  const reducedMotion = useReducedMotion()
  const override = useSyncExternalStore(noop, readStageOverride, () => null)
  const saveData = useSyncExternalStore(noop, prefersSaveData, () => false)
  return stageAllowed(override, reducedMotion, saveData)
}
