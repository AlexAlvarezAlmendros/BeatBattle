import { texture } from '@beatbattle/shared/tokens'
import { describe, expect, it } from 'vitest'
import { HALFTONE_SHAPES, halftoneDots } from './halftone'

const full = () => 1
const none = () => 0

describe('trama halftone (§3.2 «Texturas», 0.23)', () => {
  it('es determinista: el mismo tamaño y la misma forma dan los mismos puntos', () => {
    const a = halftoneDots(300, 200, { ink: 'x', shape: HALFTONE_SHAPES.menuWedge })
    const b = halftoneDots(300, 200, { ink: 'x', shape: HALFTONE_SHAPES.menuWedge })
    expect(a).toEqual(b)
    expect(a.length).toBeGreaterThan(0)
  })

  it('el radio nunca pasa de celda × máximo (los tokens) y la forma 0 no pinta nada', () => {
    const dots = halftoneDots(240, 240, { ink: 'x', shape: full })
    const limit = texture.halftoneCell * texture.halftoneMax
    for (const dot of dots) expect(dot.r).toBeLessThanOrEqual(limit + 1e-9)
    expect(halftoneDots(240, 240, { ink: 'x', shape: none })).toEqual([])
  })

  it('RD-VIS-05: la cuña del menú no lleva puntos arriba a la izquierda, donde va el texto', () => {
    const width = 1440
    const height = 900
    const dots = halftoneDots(width, height, { ink: 'x', shape: HALFTONE_SHAPES.menuWedge })
    // «ELIGE MODO» y la primera placa: del 58 % al 80 % del ancho y hasta el 30 % del alto.
    const inTitle = dots.filter((d) => d.x > width * 0.58 && d.x < width * 0.8 && d.y < height * 0.3)
    expect(inTitle).toEqual([])
    // Y crece hacia abajo a la derecha.
    expect(dots.some((d) => d.x > width * 0.9 && d.y > height * 0.6)).toBe(true)
  })

  it('las formas dan valores dentro de [0, 1] (o más, que se recorta) y nunca NaN', () => {
    for (const shape of Object.values(HALFTONE_SHAPES)) {
      for (let u = 0; u <= 1; u += 0.1)
        for (let v = 0; v <= 1; v += 0.1) expect(Number.isNaN(shape(u, v))).toBe(false)
    }
  })
})
