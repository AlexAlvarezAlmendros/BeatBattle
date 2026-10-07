import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  bandEnergy,
  createReactivity,
  energyLevel,
  lowPassAlpha,
  maxFlashesPerSecond,
  REACTIVE_BAND_HZ,
  REACTIVE_MAX_SCALE,
  relativeLuminance,
} from '../src/reactive'

/** Energía de la banda del bombo en un beat a `bpm`: golpe en cada negra que decae en ~150 ms. */
const kickEnergy = (t: number, bpm: number) => {
  const beat = 60 / bpm
  const since = t % beat
  return 0.2 + 0.75 * Math.exp(-since / 0.15)
}

describe('reactividad al audio (§3.5 capa 0, 1.6)', () => {
  it('energía de una banda: la media de sus bins en [0, 1]', () => {
    const bins = new Uint8Array(512)
    // A 48 kHz con FFT de 1024, cada bin son 46,875 Hz: el bombo (40–160 Hz) va del bin 0 al 4.
    bins.fill(255, 0, 4)
    expect(bandEnergy(bins, 48_000, 1024, REACTIVE_BAND_HZ)).toBeCloseTo(4 / 5, 10)
    expect(bandEnergy(new Uint8Array(512), 48_000, 1024, REACTIVE_BAND_HZ)).toBe(0)
  })

  it('la puerta deja quieto lo que no llega al suelo y satura en el techo', () => {
    expect(energyLevel(0.2)).toBe(0)
    expect(energyLevel(0.9)).toBe(1)
    expect(energyLevel(Number.NaN)).toBe(0)
  })

  it('§3.5: la escala de punto nunca pasa del 15 %, ni baja de la de reposo', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(fc.double({ min: -1, max: 2, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true })),
        ),
        (steps) => {
          const reactivity = createReactivity()
          for (const [energy, dt] of steps) {
            const scale = reactivity.step(energy, dt)
            expect(scale).toBeGreaterThanOrEqual(1)
            expect(scale).toBeLessThanOrEqual(1 + REACTIVE_MAX_SCALE + 1e-12)
          }
        },
      ),
    )
  })

  it('§3.5: el paso bajo no depende de los fps (30 y 60 fps llegan al mismo sitio)', () => {
    const at30 = createReactivity()
    const at60 = createReactivity()
    for (let i = 0; i < 30; i++) at30.step(1, 1 / 30)
    for (let i = 0; i < 60; i++) at60.step(1, 1 / 60)
    expect(at30.level).toBeCloseTo(at60.level, 10)
    expect(lowPassAlpha(2, 0)).toBe(0)
  })

  it('§3.5: el corte es de 2 Hz: un golpe de 160 BPM (2,67 Hz) llega muy atenuado', () => {
    const reactivity = createReactivity()
    const scales: number[] = []
    for (let i = 0; i < 600; i++) {
      const scale = reactivity.step(kickEnergy(i / 60, 160), 1 / 60)
      if (i >= 300) scales.push(scale)
    }
    // Sin filtro, la escala iría de 1 a 1,15 en cada golpe. Un polo a 2 Hz deja pasar a 2,67 Hz como mucho
    // 1/√(1 + (2,67/2)²) ≈ 0,6 de la oscilación.
    const gain = 1 / Math.sqrt(1 + (160 / 60 / 2) ** 2)
    expect(Math.max(...scales) - Math.min(...scales)).toBeLessThan(REACTIVE_MAX_SCALE * gain)
  })

  it('el contador de destellos cuenta bien: blanco y negro a 4 Hz son 4 por segundo; a 2 Hz, 2', () => {
    const square = (hz: number) =>
      Array.from({ length: 600 }, (_, i) => ({
        t: i / 60,
        luminance: Math.floor((i / 60) * hz * 2) % 2 ? 1 : 0,
      }))
    expect(maxFlashesPerSecond(square(4))).toBe(4)
    expect(maxFlashesPerSecond(square(2))).toBe(2)
    // Cambios pequeños (menos de 0,1) no cuentan aunque sean rápidos.
    expect(
      maxFlashesPerSecond(
        Array.from({ length: 600 }, (_, i) => ({ t: i / 60, luminance: 0.3 + (i % 2) * 0.05 })),
      ),
    ).toBe(0)
    // Tampoco entre tonos muy claros (el más oscuro por encima de 0,8).
    expect(
      maxFlashesPerSecond(
        Array.from({ length: 600 }, (_, i) => ({ t: i / 60, luminance: 0.85 + (i % 2) * 0.15 })),
      ),
    ).toBe(0)
  })

  it('luminancia relativa de WCAG: negro 0, blanco 1, rojo puro 0,2126', () => {
    expect(relativeLuminance([0, 0, 0])).toBe(0)
    expect(relativeLuminance([1, 1, 1])).toBeCloseTo(1, 10)
    expect(relativeLuminance([1, 0, 0])).toBeCloseTo(0.2126, 10)
  })
})
