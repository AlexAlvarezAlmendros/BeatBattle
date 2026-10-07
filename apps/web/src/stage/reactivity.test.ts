import {
  createReactivity,
  maxFlashesPerSecond,
  REACTIVE_MAX_SCALE,
  relativeLuminance,
} from '@beatbattle/audio'
import { color } from '@beatbattle/shared/tokens'
import { describe, expect, it } from 'vitest'
import { hexToRgb } from './particles/model'

/** Energía de la banda del bombo en un beat a `bpm`: golpe en cada negra que decae en ~150 ms. */
const kickEnergy = (t: number, bpm: number) => 0.2 + 0.75 * Math.exp(-(t % (60 / bpm)) / 0.15)

describe('reactividad de la arena (§3.5 capa 0, 1.6)', () => {
  it('RNF-A11Y-04: con un beat a 160 BPM, la cuña no destella (0 por segundo, WCAG 2.3.1), ni con la trama en su zona más densa', () => {
    // La cuña es granate con la trama roja; la cobertura de la trama crece con el cuadrado de la escala.
    // 0,55 es la de su zona más densa: el peor caso.
    const red = relativeLuminance(hexToRgb(color.red))
    const wine = relativeLuminance(hexToRgb(color.wine2))
    const coverage = (scale: number) => Math.min(1, 0.55 * scale * scale)
    const reactivity = createReactivity()
    const samples = Array.from({ length: 600 }, (_, i) => {
      const t = i / 30
      const c = coverage(reactivity.step(kickEnergy(t, 160), 1 / 30))
      return { t, luminance: c * red + (1 - c) * wine }
    })
    expect(maxFlashesPerSecond(samples)).toBe(0)
    // Ni con la escala máxima fija llegaría la diferencia al 0,1 de un destello: el rojo de la marca es
    // oscuro en luminancia relativa (0,21).
    const most = coverage(1 + REACTIVE_MAX_SCALE) * red + (1 - coverage(1 + REACTIVE_MAX_SCALE)) * wine
    const least = coverage(1) * red + (1 - coverage(1)) * wine
    expect(most - least).toBeLessThan(0.1)
  })
})
