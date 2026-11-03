import type Rapier from '@dimforge/rapier3d-compat'
import type { ImpulseJoint, RigidBody, World } from '@dimforge/rapier3d-compat'
import { cardToWorld, dragImpulse, PASS, pivotLocal, restPose, type Vec2, zAngle } from './passModel'

/**
 * La física del pase (guía §3.4.4; tarea 7.23), con Rapier: un remache fijo, la cinta como tres tramos de cuerda entre
 * dos puntos con masa y la carta colgada del último por el ojal de su pinza. Todo va en el plano (nada se mueve en z y
 * solo la carta gira, alrededor de z), así que es un péndulo de cadena: estable, barato y sin la cuerda en 3D del
 * `Lanyard` del sello. Nada choca con nada.
 *
 * El mismo constructor lo usan la vista (con el mundo de `@react-three/rapier`) y el test (con un mundo propio en
 * Node), para que lo probado sea lo que se ve.
 */

type RapierApi = typeof Rapier

export interface PassBodies {
  peg: RigidBody
  links: RigidBody[]
  card: RigidBody
  joints: ImpulseJoint[]
}

/** Sin grupos de colisión: ni la cinta ni la carta chocan con nada. */
const NO_COLLISIONS = 0

/**
 * Crea el pase en `world`, colgado de `peg` (coordenadas de la escena) con una cinta de `ribbon` de largo, en reposo y
 * dormido: no se mueve (ni pide fotogramas) hasta que algo lo despierta.
 */
export function buildPass(world: World, R: RapierApi, peg: Vec2, ribbon: number): PassBodies {
  const pose = restPose(ribbon)
  const seg = ribbon / PASS.ribbon.links
  // Todo en el plano: nada se mueve en z; los eslabones no giran (son puntos de la cinta) y la carta solo gira en z.
  const planar = (desc: Rapier.RigidBodyDesc, turns: boolean) =>
    desc
      .enabledTranslations(true, true, false)
      .enabledRotations(false, false, turns)
      .setAdditionalSolverIterations(PASS.solverIterations)
      .setCanSleep(true)
      .setSleeping(true)

  const pegBody = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(peg.x, peg.y, 0))
  const links = pose.links.map((p) => {
    const body = world.createRigidBody(
      planar(
        R.RigidBodyDesc.dynamic()
          .setTranslation(peg.x + p.x, peg.y + p.y, 0)
          .setLinearDamping(PASS.damping.link.linear)
          .setAngularDamping(PASS.damping.link.angular),
        false,
      ),
    )
    world.createCollider(
      R.ColliderDesc.ball(seg / 4)
        .setMass(PASS.mass.link)
        .setCollisionGroups(NO_COLLISIONS)
        .setSolverGroups(NO_COLLISIONS),
      body,
    )
    return body
  })
  // El cuerpo de la carta va girado `rest` respecto a la carta que se ve (su caja y su dibujo llevan ese giro dentro): con
  // el ojal en la vertical de su centro, nace en equilibrio y sin girar.
  const half = PASS.rest / 2
  const card = world.createRigidBody(
    planar(
      R.RigidBodyDesc.dynamic()
        .setTranslation(peg.x + pose.card.x, peg.y + pose.card.y, 0)
        .setLinearDamping(PASS.damping.card.linear)
        .setAngularDamping(PASS.damping.card.angular),
      true,
    ),
  )
  world.createCollider(
    R.ColliderDesc.cuboid(PASS.card.w / 2, PASS.card.h / 2, PASS.card.depth / 2)
      .setRotation({ x: 0, y: 0, z: Math.sin(half), w: Math.cos(half) })
      .setMass(PASS.mass.card)
      .setCollisionGroups(NO_COLLISIONS)
      .setSolverGroups(NO_COLLISIONS),
    card,
  )

  // La cinta: cuerdas entre sus puntos (como mucho un tramo de largo: se puede combar, no estirar), y la última, del
  // último punto al ojal de la pinza, donde la carta gira libre.
  const v = (p: Vec2) => ({ x: p.x, y: p.y, z: 0 })
  const origin = { x: 0, y: 0, z: 0 }
  const joints: ImpulseJoint[] = []
  let previous = pegBody
  for (const link of links) {
    joints.push(world.createImpulseJoint(R.JointData.rope(seg, origin, origin), previous, link, true))
    previous = link
  }
  joints.push(world.createImpulseJoint(R.JointData.rope(seg, origin, v(bodyPivot())), previous, card, true))
  return { peg: pegBody, links, card, joints }
}

/** Quita el pase del mundo (las cuerdas se van con sus cuerpos). Si el mundo ya no está, no hace nada. */
export function removePass(world: World, bodies: PassBodies): void {
  try {
    for (const body of [bodies.card, ...bodies.links, bodies.peg]) world.removeRigidBody(body)
  } catch {
    // El mundo de `<Physics>` se ha liberado antes: sus cuerpos se fueron con él.
  }
}

/** El ojal en coordenadas del cuerpo de la carta: en la vertical de su centro, a la distancia del de la carta. */
const bodyPivot = (): Vec2 => ({ x: 0, y: Math.hypot(pivotLocal().x, pivotLocal().y) })

/** Centro y giro de la carta que se ve (el del cuerpo más el de reposo). */
export function cardState(card: RigidBody): { center: Vec2; angle: number } {
  const t = card.translation()
  return { center: { x: t.x, y: t.y }, angle: zAngle(card.rotation()) + PASS.rest }
}

/** Los puntos de la cadena para dibujar la cinta: el remache, los puntos intermedios y el ojal de la pinza. */
export function chainPoints(bodies: PassBodies): Vec2[] {
  const peg = bodies.peg.translation()
  const points: Vec2[] = [{ x: peg.x, y: peg.y }]
  for (const link of bodies.links) {
    const t = link.translation()
    points.push({ x: t.x, y: t.y })
  }
  const { center, angle } = cardState(bodies.card)
  points.push(cardToWorld(pivotLocal(), center, angle))
  return points
}

/** Lo que mueve el pase en un paso: el arrastre (punto agarrado y puntero) y un empujón de giro. */
export interface PassInput {
  drag: { grab: Vec2; target: Vec2 } | null
  kick: number
}

/** Inercia de la carta alrededor de z (una placa de 1 × 88/63). */
const CARD_INERTIA = (PASS.mass.card * (PASS.card.w ** 2 + PASS.card.h ** 2)) / 12

/**
 * Las fuerzas de un paso (se llama antes de cada paso de física): si se está arrastrando, el tirón hacia el puntero en
 * el punto agarrado, y el empujón de giro de la tecla C (`kick`, en rad/s). Las fuerzas de Rapier duran hasta que se
 * quitan: cada paso empieza de cero.
 */
export function applyForces(bodies: PassBodies, dt: number, input: PassInput): void {
  const { card } = bodies
  const { drag, kick } = input
  for (const body of [card, ...bodies.links]) {
    body.resetForces(false)
    body.resetTorques(false)
  }
  if (kick) card.addTorque({ x: 0, y: 0, z: (kick * CARD_INERTIA) / dt }, true)
  if (!drag) return
  const v = card.linvel()
  const w = card.angvel().z
  const { center, angle } = cardState(card)
  const { impulse, point } = dragImpulse(
    { center, angle, linvel: { x: v.x, y: v.y }, angvel: w, mass: PASS.mass.card },
    drag.grab,
    drag.target,
  )
  card.addForceAtPoint({ x: impulse.x / dt, y: impulse.y / dt, z: 0 }, { x: point.x, y: point.y, z: 0 }, true)
}

/** ¿Se mueve algo? (Dormidos todos, el Escenario vuelve a pintar solo bajo demanda.) */
export function passAwake(bodies: PassBodies): boolean {
  return !bodies.card.isSleeping() || bodies.links.some((link) => !link.isSleeping())
}
