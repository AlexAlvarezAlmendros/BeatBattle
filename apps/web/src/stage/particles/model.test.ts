import { createRng } from '@beatbattle/rules'
import { color } from '@beatbattle/shared/tokens'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { FLASH_LIMITS } from '../../ui/flash/flash'
import {
  BURST_COUNT,
  burstCount,
  burstRadius,
  hexToRgb,
  PARTICLE_BUDGET,
  particleAt,
  spawnBurst,
} from './model'

const random = (seed: string) => {
  const rng = createRng(seed)
  return () => rng.next()
}

describe('partículas del Escenario (§3.5 capa 2, §4.17)', () => {
  it('§4.17: presupuesto de 4.000 en alta y 1.500 en media; baja, el 25 %; apagada, ninguna', () => {
    expect(PARTICLE_BUDGET).toEqual({ alta: 4000, media: 1500, baja: 1000, apagada: 0 })
  })

  it('§4.17: una ráfaga se escala con el presupuesto de la calidad y nunca pasa de él', () => {
    expect(burstCount('sparks', 'alta')).toBe(BURST_COUNT.sparks)
    expect(burstCount('confetti', 'media')).toBe(Math.round((BURST_COUNT.confetti * 1500) / 4000))
    expect(burstCount('sparks', 'apagada')).toBe(0)
    expect(burstCount('confetti', 'alta', 99_999)).toBe(4000)
    expect(burstCount('confetti', 'alta', -5)).toBe(0)
  })

  it('RD-MOT-04: el círculo de la ráfaga ocupa como mucho el área autorizada (≤ 25 % de la ventana)', () => {
    const width = 1440
    const height = 900
    const radius = burstRadius(FLASH_LIMITS.maxArea, width, height)
    expect((Math.PI * radius * radius) / (width * height)).toBeCloseTo(FLASH_LIMITS.maxArea, 10)
    expect(burstRadius(Number.NaN, width, height)).toBe(0)
    expect(burstRadius(3, width, height)).toBe(burstRadius(1, width, height))
  })

  it('RD-MOT-04: ninguna partícula sale de su círculo en toda su vida, ni pasa de la opacidad autorizada', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('sparks' as const, 'confetti' as const),
        fc.integer({ min: 1, max: 400 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.string(),
        (kind, radius, t, seed) => {
          const particles = spawnBurst({ kind, x: 500, y: 300, count: 20, radius, alpha: 0.4 }, random(seed))
          for (const particle of particles) {
            const at = particleAt(particle, t)
            expect(Math.hypot(at.x - 500, at.y - 300)).toBeLessThanOrEqual(radius + 1e-9)
            expect(particle.alpha).toBeLessThanOrEqual(FLASH_LIMITS.maxOpacity)
          }
        },
      ),
    )
  })

  it('§3.5: chispas rojas y blancas; confeti en la paleta, con los colores de los tokens', () => {
    const sparks = spawnBurst(
      { kind: 'sparks', x: 0, y: 0, count: 200, radius: 100, alpha: 0.4 },
      random('a'),
    )
    const confetti = spawnBurst(
      { kind: 'confetti', x: 0, y: 0, count: 200, radius: 100, alpha: 0.4 },
      random('b'),
    )
    const key = (rgb: number[]) => rgb.join(',')
    const sparkColors = new Set(sparks.map((particle) => key(particle.rgb)))
    expect(sparkColors).toEqual(new Set([key(hexToRgb(color.red)), key(hexToRgb(color.white))]))
    const palette = [color.red, color.white, color.faceRedTint, color.redShade].map((hex) =>
      key(hexToRgb(hex)),
    )
    for (const particle of confetti) expect(palette).toContain(key(particle.rgb))
    expect(sparks.every((particle) => particle.kind === 0 && particle.spin === 0)).toBe(true)
    expect(confetti.every((particle) => particle.kind === 1 && particle.spin !== 0)).toBe(true)
  })

  it('con la misma semilla, la misma ráfaga', () => {
    const spec = { kind: 'confetti' as const, x: 10, y: 20, count: 30, radius: 80, alpha: 0.3 }
    expect(spawnBurst(spec, random('x'))).toEqual(spawnBurst(spec, random('x')))
  })
})
