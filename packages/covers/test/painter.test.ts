import { color } from '@beatbattle/shared/tokens'
import { describe, expect, it } from 'vitest'
import {
  COVER_DISK,
  type Cover2D,
  coverContext,
  coverDots,
  coverOptionsOf,
  drawCover,
  measureCover,
  tonicOf,
} from '../src/index'

/** Contexto 2D falso que anota lo que se pinta (colores, arcos y rellenos) y devuelve `pixels` al medir. */
function recorder(pixels: number[] = []) {
  const fills: { style: unknown; alpha: number; kind: 'rect' | 'path' }[] = []
  const strokes: unknown[] = []
  const arcs: { x: number; y: number; r: number }[] = []
  const stops: string[] = []
  const ctx: Cover2D = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    clearRect: () => {},
    fillRect() {
      fills.push({ style: this.fillStyle, alpha: this.globalAlpha, kind: 'rect' })
    },
    createRadialGradient: () => ({ addColorStop: (_offset, stop) => stops.push(stop) }),
    save: () => {},
    restore: () => {},
    translate: () => {},
    rotate: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: (x, y, r) => arcs.push({ x, y, r }),
    fill() {
      fills.push({ style: this.fillStyle, alpha: this.globalAlpha, kind: 'path' })
    },
    stroke() {
      strokes.push(this.strokeStyle)
    },
    getImageData: () => ({ data: pixels }),
  }
  return { ctx, fills, strokes, arcs, stops }
}

describe('pintor de portadas (§3.4.5, tarea 4.11)', () => {
  it('RD-VIS-04: pide el contexto 2D por CPU (willReadFrequently)', () => {
    let asked: unknown = null
    const canvas = {
      width: 256,
      height: 256,
      getContext: (_type: '2d', options: { willReadFrequently: boolean }) => {
        asked = options
        return recorder().ctx
      },
    }
    coverContext(canvas)
    expect(asked).toEqual({ willReadFrequently: true })
    expect(() => coverContext({ ...canvas, getContext: () => null })).toThrow()
  })

  it('§3.4.5: mismo fondo para todas y solo colores de la paleta (rojo, blanco, granate y negro)', () => {
    const allowed = new Set<unknown>([
      color.red,
      color.white,
      color.black,
      color.wine2,
      color.wine3,
      color.line,
    ])
    for (const seed of ['entrada-1', 'entrada-2', '4093857123']) {
      const { ctx, fills, strokes, stops } = recorder()
      drawCover(ctx, 256, coverDots(seed))
      expect(stops).toEqual([color.wine2, color.wine2, color.wine3, color.black])
      for (const fill of fills) if (typeof fill.style === 'string') expect(allowed.has(fill.style)).toBe(true)
      for (const stroke of strokes) expect(allowed.has(stroke)).toBe(true)
      // 24 rayos al 3 %.
      expect(fills.filter((fill) => fill.style === color.white && fill.alpha === 0.03)).toHaveLength(24)
    }
  })

  it('§3.4.5: los puntos caen dentro del disco (46 % del lado) y los blancos van al 94 %', () => {
    const { ctx, fills, arcs } = recorder()
    const size = 300
    const dots = coverDots('entrada-7')
    drawCover(ctx, size, dots)
    const center = size / 2
    const disk = size * COVER_DISK
    const emblem = arcs.slice(0, -4)
    expect(emblem.length).toBeGreaterThan(50)
    for (const arc of emblem)
      expect(Math.hypot(arc.x - center, arc.y - center) - arc.r).toBeLessThanOrEqual(disk)
    expect(fills.some((fill) => fill.style === color.white && fill.alpha === 0.94)).toBe(true)
  })

  it('la calibración escala los puntos: con kRed > 1 los rojos crecen (hasta su tope)', () => {
    const dots = coverDots('entrada-3')
    const total = (k: number) => {
      const { ctx, arcs } = recorder()
      drawCover(ctx, 256, { ...dots, white: [] }, k, 1)
      return arcs.slice(0, -4).reduce((sum, arc) => sum + arc.r * arc.r, 0)
    }
    expect(total(1.2)).toBeGreaterThan(total(1))
    expect(total(1000)).toBeLessThanOrEqual(dots.red.length * (dots.rmax * 256 * COVER_DISK) ** 2 + 1e-6)
  })

  it('measureCover: proporción de rojo y luminancia relativa (WCAG) de los píxeles', () => {
    // Un píxel rojo puro, uno blanco, uno negro y uno gris.
    const pixels = [255, 0, 60, 255, 255, 255, 255, 255, 0, 0, 0, 255, 128, 128, 128, 255]
    const { ctx } = recorder(pixels)
    const stats = measureCover(ctx, 2, 2)
    expect(stats.red).toBeCloseTo((255 - 60) / 255 / 4, 6)
    const lin = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4)
    const expected = (0.2126 * lin(255) + 0.0722 * lin(60) + 1 + 0 + lin(128)) / 4
    expect(stats.lum).toBeCloseTo(expected, 6)
  })

  it('§3.4.5: los pliegues salen de la tónica (la notación de TONICS de shared) y el giro del BPM', () => {
    ;['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].forEach((tonic, index) => {
      expect(tonicOf(tonic)).toBe(index)
      expect(tonicOf(`${tonic}m`)).toBe(index)
    })
    expect(coverOptionsOf({ musicalKey: 'Am', bpm: 140 })).toEqual({ key: 9, bpm: 140 })
    expect(coverOptionsOf({ musicalKey: 'C', bpm: null })).toEqual({ key: 0 })
    expect(coverOptionsOf({})).toEqual({})
    expect(coverOptionsOf({ musicalKey: 'H' })).toEqual({})
    expect(coverDots('x', coverOptionsOf({ musicalKey: 'F#m' })).spec.folds).toBe(3 + (6 % 6))
  })
})
