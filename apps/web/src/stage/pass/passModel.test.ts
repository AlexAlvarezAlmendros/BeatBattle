import { describe, expect, it } from 'vitest'
import {
  cardToWorld,
  clampTarget,
  hitCard,
  PASS,
  passLayout,
  pivotLocal,
  restPose,
  strandAnchors,
  strandPoints,
  strandRestLength,
} from './passModel'

const deg = (r: number) => (r * 180) / Math.PI

/** La carta plana a 1440 × 900: 320 px de ancho, bajo un hueco de 96 px, en una vista con margen a los lados. */
const MEASURES = { viewW: 416, viewH: 559, cardLeft: 48, cardTop: 96, cardW: 320, cardH: 447 }

describe('pase de torneo: medidas', () => {
  it('RF-GAME-07: el ojal descentrado deja la carta a −3° en reposo (el giro de la plana)', () => {
    const pivot = pivotLocal()
    // Con el centro de masas en la vertical del ojal, el giro de reposo es atan(x / y).
    expect(deg(Math.atan2(pivot.x, pivot.y))).toBeCloseTo(3, 6)
    // En CSS, −3° (`--bb-tilt-card`): en three, que gira al revés, +3°.
    expect(deg(PASS.rest)).toBeCloseTo(3, 6)
    // El ojal cae dentro de la pinza.
    expect(Math.abs(pivot.x)).toBeLessThan(PASS.clip.half)
  })

  it('RF-GAME-07: la carta 3D descansa donde está la plana (mismo centro y ancho): el relevo no salta', () => {
    const layout = passLayout(MEASURES)
    expect(layout.ppu).toBe(320)
    const pose = restPose(layout.ribbon)
    const center = { x: layout.peg.x + pose.card.x, y: layout.peg.y + pose.card.y }
    // El centro de la plana, en unidades desde el centro de la vista (y hacia arriba).
    const flat = {
      x: (MEASURES.cardLeft + MEASURES.cardW / 2 - MEASURES.viewW / 2) / 320,
      y: -(MEASURES.cardTop + MEASURES.cardH / 2 - MEASURES.viewH / 2) / 320,
    }
    expect(center.x).toBeCloseTo(flat.x, 9)
    expect(center.y).toBeCloseTo(flat.y, 9)
    expect(pose.angle).toBe(PASS.rest)
    // La cinta cabe en el hueco de encima de la carta.
    expect(layout.ribbon).toBeGreaterThan(PASS.ribbon.min)
    expect(layout.peg.y).toBeLessThan(layout.view.h / 2)
  })

  it('RF-GAME-07: la cinta en Λ: los dos tramos salen del remache y acaban en su ranura de la pinza', () => {
    const ribbon = 0.2
    const pose = restPose(ribbon)
    const chain = [{ x: 0, y: 0 }, ...pose.links, cardToWorld(pivotLocal(), pose.card, pose.angle)]
    const [leftAnchor, rightAnchor] = strandAnchors()
    const left = strandPoints(
      chain,
      cardToWorld(leftAnchor, pose.card, pose.angle),
      -1,
      strandRestLength(ribbon, -1),
    )
    const right = strandPoints(
      chain,
      cardToWorld(rightAnchor, pose.card, pose.angle),
      1,
      strandRestLength(ribbon, 1),
    )
    expect(left[0]).toEqual({ x: 0, y: 0 })
    expect(right[0]).toEqual({ x: 0, y: 0 })
    const leftEnd = left.at(-1) as { x: number; y: number }
    const rightEnd = right.at(-1) as { x: number; y: number }
    expect(leftEnd.x).toBeLessThan(-0.1)
    expect(rightEnd.x).toBeGreaterThan(0.1)
    // En reposo van tensos: sin comba.
    const mid = left[Math.floor(left.length / 2)] as { x: number; y: number }
    expect(mid.x).toBeGreaterThan(leftEnd.x)
  })

  it('RF-GAME-07: si la carta sube, la cinta floja se comba hacia abajo en vez de encogerse', () => {
    const chain = [
      { x: 0, y: 0 },
      { x: 0, y: -0.05 },
      { x: 0, y: -0.1 },
    ]
    const taut = strandPoints(chain, { x: -0.2, y: -0.1 }, -1, Math.hypot(0.2, 0.1))
    const slack = strandPoints(chain, { x: -0.2, y: -0.1 }, -1, 0.4)
    const middle = Math.floor(taut.length / 2)
    expect((slack[middle] as { y: number }).y).toBeLessThan((taut[middle] as { y: number }).y - 0.05)
    // Los extremos no se mueven: el remache y la ranura de la pinza.
    expect(slack[0]).toEqual({ x: 0, y: 0 })
    expect((slack.at(-1) as { x: number }).x).toBeCloseTo(-0.2, 9)
  })

  it('RF-GAME-07: se agarra la carta o su pinza, no el aire de al lado', () => {
    const center = { x: 0, y: 0 }
    expect(hitCard({ x: 0.45, y: -0.6 }, center, PASS.rest)).not.toBeNull()
    expect(hitCard({ x: 0, y: PASS.card.h / 2 + PASS.clip.rise / 2 }, center, 0)).not.toBeNull()
    expect(hitCard({ x: 0.7, y: 0 }, center, 0)).toBeNull()
  })

  it('RF-GAME-07: el puntero se acota a la vista y por debajo del remache', () => {
    const layout = passLayout(MEASURES)
    const far = clampTarget({ x: 99, y: 99 }, layout)
    expect(far.x).toBeLessThan(layout.view.w / 2)
    expect(far.y).toBeLessThan(layout.peg.y)
    const low = clampTarget({ x: -99, y: -99 }, layout)
    expect(low.x).toBeGreaterThan(-layout.view.w / 2)
    expect(low.y).toBeGreaterThan(-layout.view.h / 2)
  })
})
