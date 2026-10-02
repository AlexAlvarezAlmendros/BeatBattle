import { useContext, useSyncExternalStore } from 'react'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { GlassAllowedContext } from './GlassProvider'

/**
 * Detección de capacidad para el cristal de `GlassSurface` (guía §3.1 y §3.3), portada de
 * `useGlassCapability` del sello (`ReactOtpWeb/frontend/src/hooks/useGlassCapability.js`).
 *
 * El cristal de verdad es un `backdrop-filter` con un filtro SVG de desplazamiento: solo lo pinta
 * Chromium y cuesta GPU. Sin él, cada pieza se ve con su alternativa (la isla, `--bb-glass` +
 * `blur(8px)`). Se apaga:
 * - en equipos modestos (menos de 4 GB o menos de 4 núcleos) o con ahorro de datos;
 * - con «reducir movimiento» (sistema o ajuste de la app) o «reducir transparencia»;
 * - en Safari y Firefox (no aplican `backdrop-filter: url(#…)`) y donde no se admita.
 */

/** Lo que mira la detección, separado del navegador para poder probarla. */
export interface GlassEnvironment {
  deviceMemory?: number
  hardwareConcurrency?: number
  saveData?: boolean
  reducedMotion: boolean
  reducedTransparency: boolean
  userAgent: string
  /** ¿Admite el navegador `backdrop-filter: url(#…)`? */
  supportsSvgBackdrop: boolean
}

/** Hardware modesto o ahorro de datos: nada de efectos caros (igual que el sello). */
export function isLowEndDevice(
  env: Pick<GlassEnvironment, 'deviceMemory' | 'hardwareConcurrency' | 'saveData'>,
) {
  if (env.deviceMemory !== undefined && env.deviceMemory < 4) return true
  if (env.hardwareConcurrency !== undefined && env.hardwareConcurrency < 4) return true
  return env.saveData === true
}

/** Decisión pura: ¿se pinta el cristal con desplazamiento SVG? */
export function detectGlassCapability(env: GlassEnvironment): boolean {
  if (isLowEndDevice(env)) return false
  if (env.reducedMotion || env.reducedTransparency) return false
  const isSafari = /Safari/.test(env.userAgent) && !/Chrom/.test(env.userAgent)
  if (isSafari || /Firefox/.test(env.userAgent)) return false
  return env.supportsSvgBackdrop
}

interface NavigatorHints {
  deviceMemory?: number
  connection?: { saveData?: boolean }
}

const matches = (query: string) => typeof window.matchMedia === 'function' && window.matchMedia(query).matches

/**
 * La parte que no cambia durante la sesión (hardware, navegador y soporte), calculada una vez como en
 * el sello. Las preferencias se miran aparte, en caliente.
 */
let staticCapability: boolean | undefined

function readStaticCapability(): boolean {
  if (staticCapability !== undefined) return staticCapability
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  const hints = navigator as Navigator & NavigatorHints
  staticCapability = detectGlassCapability({
    deviceMemory: hints.deviceMemory,
    hardwareConcurrency: navigator.hardwareConcurrency,
    saveData: hints.connection?.saveData,
    reducedMotion: false,
    reducedTransparency: false,
    userAgent: navigator.userAgent,
    supportsSvgBackdrop:
      typeof CSS !== 'undefined' &&
      typeof CSS.supports === 'function' &&
      (CSS.supports('backdrop-filter', 'url(#bb-glass-probe)') ||
        CSS.supports('-webkit-backdrop-filter', 'url(#bb-glass-probe)')),
  })
  return staticCapability
}

const TRANSPARENCY_QUERY = '(prefers-reduced-transparency: reduce)'

function subscribeTransparency(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const media = window.matchMedia(TRANSPARENCY_QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

/**
 * Hook: ¿pinta esta sesión el cristal con desplazamiento? Reacciona en caliente a «reducir
 * movimiento» y «reducir transparencia», y respeta un `GlassProvider` apagado por encima.
 */
export function useGlassCapability(): boolean {
  const allowed = useContext(GlassAllowedContext)
  const reducedMotion = useReducedMotion()
  const reducedTransparency = useSyncExternalStore(
    subscribeTransparency,
    () => matches(TRANSPARENCY_QUERY),
    () => false,
  )
  return allowed && !reducedMotion && !reducedTransparency && readStaticCapability()
}

/** Solo para tests: olvida la detección cacheada. */
export function resetGlassCapabilityCache(): void {
  staticCapability = undefined
}
