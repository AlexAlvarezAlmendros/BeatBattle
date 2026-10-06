import { describe, expect, it } from 'vitest'
import { arenaUsesStage, medianFps, qualityFromFps, stageDpr } from './quality'

describe('calidad del Escenario (§3.5, 1.2)', () => {
  it('§3.5: umbrales de la sonda: ≥ 50 fps alta, ≥ 35 media, ≥ 20 baja y por debajo apagada', () => {
    expect(qualityFromFps(60)).toBe('alta')
    expect(qualityFromFps(50)).toBe('alta')
    expect(qualityFromFps(49.9)).toBe('media')
    expect(qualityFromFps(35)).toBe('media')
    expect(qualityFromFps(34)).toBe('baja')
    expect(qualityFromFps(20)).toBe('baja')
    expect(qualityFromFps(19)).toBe('apagada')
    expect(qualityFromFps(0)).toBe('apagada')
  })

  it('§3.5: la mediana de los fotogramas no se deja llevar por un tirón suelto', () => {
    const deltas = [...Array(59).fill(1 / 60), 0.5]
    expect(medianFps(deltas)).toBeCloseTo(60)
    expect(medianFps([])).toBe(0)
    expect(medianFps([Number.NaN, -1])).toBe(0)
  })

  it('§3.5: alta y media pintan la arena con el Escenario; baja y apagada, la estática', () => {
    expect(arenaUsesStage(null)).toBe(true)
    expect(arenaUsesStage('alta')).toBe(true)
    expect(arenaUsesStage('media')).toBe(true)
    expect(arenaUsesStage('baja')).toBe(false)
    expect(arenaUsesStage('apagada')).toBe(false)
  })

  it('§3.5: la trama va al dpr del dispositivo (1–2) en alta y a dpr 1 en media', () => {
    expect(stageDpr('alta')).toEqual([1, 2])
    expect(stageDpr(null)).toEqual([1, 2])
    expect(stageDpr('media')).toBe(1)
  })
})
