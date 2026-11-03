import R from '@dimforge/rapier3d-compat'
import { beforeAll, describe, expect, it } from 'vitest'
import { cardToWorld, PASS, pivotLocal, restPose } from './passModel'
import { applyForces, buildPass, cardState, type PassBodies, type PassInput, passAwake } from './passPhysics'

/**
 * La física del pase con el Rapier de verdad (el WASM corre en Node), con el mismo constructor que usa la vista: lo
 * que se prueba aquí es lo que se ve en el perfil.
 */

const STEP = 1 / 60
const PEG = { x: 0.1, y: 1.2 }
const RIBBON = 0.2
const deg = (r: number) => (r * 180) / Math.PI

beforeAll(async () => {
  await R.init()
})

function world() {
  const w = new R.World({ x: 0, y: -PASS.gravity, z: 0 })
  w.timestep = STEP
  return w
}

const IDLE: PassInput = { drag: null, kick: 0 }

/** `steps` pasos con las fuerzas de cada uno (amortiguación, arrastre, empujón), como en la vista. */
function run(w: R.World, bodies: PassBodies, steps: number, input: (step: number) => PassInput = () => IDLE) {
  for (let i = 0; i < steps; i++) {
    applyForces(bodies, STEP, input(i))
    w.step()
  }
}

describe('física del pase de torneo', () => {
  it('RF-GAME-07: la carta nace en reposo, dormida y colgando a −3°, justo debajo del remache', () => {
    const w = world()
    const bodies = buildPass(w, R, PEG, RIBBON)
    const { center, angle } = cardState(bodies.card)
    const pose = restPose(RIBBON)
    expect(deg(angle)).toBeCloseTo(3, 5)
    expect(center.x).toBeCloseTo(PEG.x + pose.card.x, 5)
    expect(center.y).toBeCloseTo(PEG.y + pose.card.y, 5)
    // El ojal (donde engancha la cinta) cae en la vertical del remache.
    const pivot = cardToWorld(pivotLocal(), center, angle)
    expect(pivot.x).toBeCloseTo(PEG.x, 5)
    expect(passAwake(bodies)).toBe(false)
    run(w, bodies, 60)
    expect(cardState(bodies.card).center.y).toBeCloseTo(center.y, 5)
    w.free()
  })

  it('RF-GAME-07: tras un empujón, la carta vuelve a −3° y se duerme', () => {
    const w = world()
    const bodies = buildPass(w, R, PEG, RIBBON)
    run(w, bodies, 1, () => ({ drag: null, kick: 6 }))
    run(w, bodies, 10)
    expect(Math.abs(deg(cardState(bodies.card).angle) - 3)).toBeGreaterThan(2)
    run(w, bodies, 60 * 12)
    const { center, angle } = cardState(bodies.card)
    expect(deg(angle)).toBeCloseTo(3, 0)
    expect(center.x).toBeCloseTo(PEG.x, 1)
    expect(passAwake(bodies)).toBe(false)
    w.free()
  })

  it('RF-GAME-07: arrastrada, la carta sigue al puntero sin despegarse de la cinta', () => {
    const w = world()
    const bodies = buildPass(w, R, PEG, RIBBON)
    const start = cardState(bodies.card).center
    // Agarrada por la esquina de abajo a la derecha y llevada lejos, a la derecha y hacia arriba.
    const grab = { x: 0.4, y: -0.6 }
    const target = { x: PEG.x + 3, y: PEG.y - 0.5 }
    run(w, bodies, 90, () => ({ drag: { grab, target }, kick: 0 }))
    const { center, angle } = cardState(bodies.card)
    expect(center.x).toBeGreaterThan(start.x + 0.3)
    // La cinta no se estira: el ojal sigue a lo sumo a su largo del remache (con la holgura del solver).
    const pivot = cardToWorld(pivotLocal(), center, angle)
    expect(Math.hypot(pivot.x - PEG.x, pivot.y - PEG.y)).toBeLessThan(RIBBON * 1.08)
    // Suelta, vuelve a colgar.
    run(w, bodies, 60 * 14)
    expect(deg(cardState(bodies.card).angle)).toBeCloseTo(3, 0)
    w.free()
  })
})
